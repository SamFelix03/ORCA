from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any
from typing import Protocol

import httpx

from orca_common.models.market import YieldMarket


class UtilizationEnricher(Protocol):
    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        ...

    async def close(self) -> None:
        ...


class _BaseEnricher:
    def __init__(self, protocol_name: str) -> None:
        self._protocol_name = protocol_name
        self._logger = logging.getLogger(f"orca_common.market.{protocol_name}")

    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        return markets

    async def close(self) -> None:
        return None


class AaveUtilizationEnricher(_BaseEnricher):
    _CHAINS_PROBE = "query ChainsProbe { chains { chainId name } }"
    _MARKETS_QUERY = (
        "query MarketsUtilization($request: MarketsRequest!) { "
        "markets(request: $request) { "
        "chain { chainId } "
        "reserves { borrowInfo { utilizationRate { value } } } "
        "} }"
    )

    def __init__(self, base_url: str, api_key: str, timeout_seconds: float) -> None:
        super().__init__("aave-v3")
        self._base_url = base_url.strip()
        self._api_key = api_key.strip()
        self._timeout_seconds = timeout_seconds
        self._client: httpx.AsyncClient | None = None
        self._graphql_probe_done = False

    async def _ensure_graphql_reachable(self) -> None:
        if self._graphql_probe_done or not self._base_url:
            return
        self._graphql_probe_done = True
        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self._timeout_seconds)
            response = await self._client.post(
                self._base_url,
                headers=self._headers(),
                json={"query": self._CHAINS_PROBE},
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("errors"):
                self._logger.warning("Aave GraphQL returned errors: %s", payload["errors"])
                return
            chains = (payload.get("data") or {}).get("chains")
            if isinstance(chains, list) and chains:
                self._logger.info("Aave GraphQL OK (%s chains)", len(chains))
            else:
                self._logger.warning("Aave GraphQL unexpected response: %s", payload)
        except Exception as exc:
            self._logger.warning("Aave GraphQL probe failed: %s", exc)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _fetch_chain_utilization(self, chain_ids: set[int]) -> dict[int, Decimal]:
        if not chain_ids or not self._base_url:
            return {}
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_seconds)
        try:
            response = await self._client.post(
                self._base_url,
                headers=self._headers(),
                json={
                    "query": self._MARKETS_QUERY,
                    "variables": {"request": {"chainIds": sorted(chain_ids)}},
                },
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("errors"):
                self._logger.warning("Aave markets query returned errors: %s", payload["errors"])
                return {}
            data = payload.get("data") or {}
            return self._parse_chain_utilization(data.get("markets"))
        except Exception as exc:
            self._logger.warning("Aave markets query failed: %s", exc)
            return {}

    def _parse_chain_utilization(self, markets: Any) -> dict[int, Decimal]:
        if not isinstance(markets, list):
            return {}
        totals: dict[int, Decimal] = {}
        counts: dict[int, int] = {}
        for market in markets:
            if not isinstance(market, dict):
                continue
            chain_id = (market.get("chain") or {}).get("chainId")
            if not isinstance(chain_id, int):
                continue
            reserves = market.get("reserves")
            if not isinstance(reserves, list):
                continue
            for reserve in reserves:
                if not isinstance(reserve, dict):
                    continue
                borrow_info = reserve.get("borrowInfo")
                if not isinstance(borrow_info, dict):
                    continue
                utilization_obj = borrow_info.get("utilizationRate")
                if not isinstance(utilization_obj, dict):
                    continue
                utilization_value = self._to_decimal(utilization_obj.get("value"))
                if utilization_value is None:
                    continue
                if utilization_value < 0:
                    continue
                if utilization_value > 1:
                    utilization_value = Decimal("1")
                totals[chain_id] = totals.get(chain_id, Decimal("0")) + utilization_value
                counts[chain_id] = counts.get(chain_id, 0) + 1
        return {
            chain_id: totals[chain_id] / Decimal(counts[chain_id])
            for chain_id in totals
            if counts.get(chain_id, 0) > 0
        }

    @staticmethod
    def _to_decimal(value: Any) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None

    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        await self._ensure_graphql_reachable()
        aave_chain_ids = {m.chain_id for m in markets if m.protocol == "aave-v3"}
        chain_utilization = await self._fetch_chain_utilization(aave_chain_ids)
        enriched: list[YieldMarket] = []
        for market in markets:
            if market.protocol != "aave-v3":
                enriched.append(market)
                continue
            utilization = chain_utilization.get(market.chain_id)
            if utilization is not None:
                enriched.append(market.model_copy(update={"utilization": utilization}))
            else:
                enriched.append(self._fallback(market))
        return enriched

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _fallback(market: YieldMarket) -> YieldMarket:
        if market.utilization > 0:
            return market
        return market.model_copy(update={"utilization": Decimal("0.65")})


class CompoundUtilizationEnricher(_BaseEnricher):
    _GET_UTILIZATION_SELECTOR = "0x7eb71131"
    _WAD = Decimal("1000000000000000000")
    _COMET_BY_CHAIN: dict[int, str] = {
        1: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",  # Ethereum USDC Comet
        8453: "0xb125e6687d4313864e53df431d5425969c15eb2f",  # Base USDC Comet
        42161: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf",  # Arbitrum USDC Comet
        10: "0x2e44e174f7d53f0212823acc11c01a11d58c5bcb",  # Optimism USDC Comet
    }
    _RPC_BY_CHAIN: dict[int, str] = {
        1: "https://ethereum-rpc.publicnode.com",
        8453: "https://base-rpc.publicnode.com",
        42161: "https://arbitrum-one-rpc.publicnode.com",
        10: "https://optimism-rpc.publicnode.com",
    }

    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        super().__init__("compound-v3")
        self._base_url = base_url.strip()
        self._timeout_seconds = timeout_seconds
        self._client: httpx.AsyncClient | None = None

    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        compound_chain_ids = {m.chain_id for m in markets if m.protocol == "compound-v3"}
        chain_utilization = await self._fetch_chain_utilization(compound_chain_ids)
        enriched: list[YieldMarket] = []
        for market in markets:
            if market.protocol != "compound-v3":
                enriched.append(market)
                continue
            utilization = chain_utilization.get(market.chain_id)
            if utilization is not None:
                enriched.append(market.model_copy(update={"utilization": utilization}))
            else:
                enriched.append(self._fallback(market))
        return enriched

    async def _fetch_chain_utilization(self, chain_ids: set[int]) -> dict[int, Decimal]:
        if not chain_ids:
            return {}
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_seconds)

        values: dict[int, Decimal] = {}
        for chain_id in sorted(chain_ids):
            comet_address = self._COMET_BY_CHAIN.get(chain_id)
            rpc_url = self._resolve_rpc_url(chain_id)
            if not comet_address or not rpc_url:
                continue
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_call",
                "params": [{"to": comet_address, "data": self._GET_UTILIZATION_SELECTOR}, "latest"],
            }
            try:
                response = await self._client.post(rpc_url, json=payload)
                response.raise_for_status()
                data = response.json()
                raw_hex = data.get("result")
                if not isinstance(raw_hex, str) or not raw_hex.startswith("0x"):
                    self._logger.warning("Compound RPC returned unexpected payload for chain %s: %s", chain_id, data)
                    continue
                utilization = Decimal(int(raw_hex, 16)) / self._WAD
                if utilization < 0:
                    continue
                if utilization > 1:
                    utilization = Decimal("1")
                values[chain_id] = utilization
            except Exception as exc:
                self._logger.warning("Compound utilization fetch failed for chain %s: %s", chain_id, exc)
        return values

    def _resolve_rpc_url(self, chain_id: int) -> str:
        if self._base_url:
            return self._base_url
        return self._RPC_BY_CHAIN.get(chain_id, "")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _fallback(market: YieldMarket) -> YieldMarket:
        if market.utilization > 0:
            return market
        return market.model_copy(update={"utilization": Decimal("0.60")})


class MorphoUtilizationEnricher(_BaseEnricher):
    _MARKETS_QUERY = (
        "query MorphoMarkets($first: Int!, $where: MarketFilters) { "
        "markets(first: $first, orderBy: BorrowAssetsUsd, orderDirection: Desc, where: $where) { "
        "items { chain { id } state { utilization } } "
        "} }"
    )

    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        super().__init__("morpho")
        self._base_url = (base_url.strip() or "https://api.morpho.org/graphql")
        self._timeout_seconds = timeout_seconds
        self._client: httpx.AsyncClient | None = None

    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        morpho_chain_ids = {m.chain_id for m in markets if m.protocol == "morpho"}
        chain_utilization = await self._fetch_chain_utilization(morpho_chain_ids)
        enriched: list[YieldMarket] = []
        for market in markets:
            if market.protocol != "morpho":
                enriched.append(market)
                continue
            utilization = chain_utilization.get(market.chain_id)
            if utilization is not None:
                enriched.append(market.model_copy(update={"utilization": utilization}))
            else:
                enriched.append(self._fallback(market))
        return enriched

    async def _fetch_chain_utilization(self, chain_ids: set[int]) -> dict[int, Decimal]:
        if not chain_ids:
            return {}
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_seconds)
        try:
            response = await self._client.post(
                self._base_url,
                headers={"Content-Type": "application/json"},
                json={
                    "query": self._MARKETS_QUERY,
                    "variables": {
                        "first": 200,
                        "where": {"chainId_in": sorted(chain_ids), "borrowAssetsUsd_gte": 1000},
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("errors"):
                self._logger.warning("Morpho markets query returned errors: %s", payload["errors"])
                return {}
            data = payload.get("data") or {}
            return self._parse_chain_utilization(data.get("markets"))
        except Exception as exc:
            self._logger.warning("Morpho markets query failed: %s", exc)
            return {}

    def _parse_chain_utilization(self, markets_node: Any) -> dict[int, Decimal]:
        if not isinstance(markets_node, dict):
            return {}
        items = markets_node.get("items")
        if not isinstance(items, list):
            return {}
        totals: dict[int, Decimal] = {}
        counts: dict[int, int] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            chain_id = (item.get("chain") or {}).get("id")
            if not isinstance(chain_id, int):
                continue
            state = item.get("state")
            if not isinstance(state, dict):
                continue
            utilization_value = self._to_decimal(state.get("utilization"))
            if utilization_value is None:
                continue
            if utilization_value < 0:
                continue
            if utilization_value > 1:
                utilization_value = Decimal("1")
            totals[chain_id] = totals.get(chain_id, Decimal("0")) + utilization_value
            counts[chain_id] = counts.get(chain_id, 0) + 1
        return {
            chain_id: totals[chain_id] / Decimal(counts[chain_id])
            for chain_id in totals
            if counts.get(chain_id, 0) > 0
        }

    @staticmethod
    def _to_decimal(value: Any) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _fallback(market: YieldMarket) -> YieldMarket:
        if market.utilization > 0:
            return market
        return market.model_copy(update={"utilization": Decimal("0.55")})


class UniswapUtilizationEnricher(_BaseEnricher):
    _UNISWAP_VOLUME_URL = "https://api.llama.fi/summary/dexs/uniswap?dataType=dailyVolume"
    _CHAIN_LABEL_BY_ID: dict[int, str] = {
        1: "Ethereum",
        8453: "Base",
        42161: "Arbitrum",
        10: "OP Mainnet",
    }

    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        super().__init__("uniswap-v3")
        self._base_url = base_url.strip() or self._UNISWAP_VOLUME_URL
        self._timeout_seconds = timeout_seconds
        self._client: httpx.AsyncClient | None = None

    async def enrich(self, markets: list[YieldMarket]) -> list[YieldMarket]:
        uniswap_markets = [m for m in markets if m.protocol == "uniswap-v3"]
        chain_volume = await self._fetch_chain_volume({m.chain_id for m in uniswap_markets})
        chain_tvl = self._sum_chain_tvl(uniswap_markets)

        enriched: list[YieldMarket] = []
        for market in markets:
            if market.protocol != "uniswap-v3":
                enriched.append(market)
                continue
            utilization = self._proxy_from_volume_and_tvl(
                chain_volume.get(market.chain_id),
                chain_tvl.get(market.chain_id),
            )
            if utilization is not None:
                enriched.append(market.model_copy(update={"utilization": utilization}))
            else:
                enriched.append(self._fallback(market))
        return enriched

    async def _fetch_chain_volume(self, chain_ids: set[int]) -> dict[int, Decimal]:
        if not chain_ids:
            return {}
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_seconds)
        try:
            response = await self._client.get(self._base_url, headers={"Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
            breakdown = payload.get("chainBreakdown")
            if not isinstance(breakdown, dict):
                self._logger.warning("Uniswap volume payload missing chainBreakdown")
                return {}
            values: dict[int, Decimal] = {}
            for chain_id in sorted(chain_ids):
                chain_label = self._CHAIN_LABEL_BY_ID.get(chain_id)
                if not chain_label:
                    continue
                row = breakdown.get(chain_label)
                if not isinstance(row, dict):
                    continue
                total24h = self._to_decimal(row.get("total24h"))
                if total24h is None or total24h <= 0:
                    continue
                values[chain_id] = total24h
            return values
        except Exception as exc:
            self._logger.warning("Uniswap volume fetch failed: %s", exc)
            return {}

    @staticmethod
    def _sum_chain_tvl(markets: list[YieldMarket]) -> dict[int, Decimal]:
        totals: dict[int, Decimal] = {}
        for market in markets:
            totals[market.chain_id] = totals.get(market.chain_id, Decimal("0")) + market.tvl_usdc
        return totals

    @staticmethod
    def _proxy_from_volume_and_tvl(volume_24h: Decimal | None, tvl: Decimal | None) -> Decimal | None:
        if volume_24h is None or tvl is None or tvl <= 0:
            return None
        ratio = volume_24h / tvl
        if ratio < 0:
            return Decimal("0")
        if ratio > 1:
            return Decimal("1")
        return ratio

    @staticmethod
    def _to_decimal(value: Any) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _fallback(market: YieldMarket) -> YieldMarket:
        # Uniswap does not expose lending utilization directly; this is a safe default.
        if market.utilization > 0:
            return market
        return market.model_copy(update={"utilization": Decimal("0.50")})
