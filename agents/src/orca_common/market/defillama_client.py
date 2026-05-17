from __future__ import annotations

from decimal import Decimal, InvalidOperation
from time import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import logging

from orca_common.models.market import YieldMarket


CHAIN_ID_BY_DEFILLAMA_NAME: dict[str, int] = {
    "ethereum": 1,
    "sepolia": 11155111,
    "arbitrum": 42161,
    "arbitrum sepolia": 421614,
    "optimism": 10,
    "optimism sepolia": 11155420,
    "base": 8453,
    "base sepolia": 84532,
    "avalanche": 43114,
    "avalanche fuji": 43113,
    "kite": 2368,
    "kite testnet": 2368,
    "kitetestnet": 2368,
    "kite-testnet": 2368,
}

PROTOCOL_MAP: tuple[tuple[str, str], ...] = (
    ("aave", "aave-v3"),
    ("compound", "compound-v3"),
    ("morpho", "morpho"),
    ("uniswap", "uniswap-v3"),
)


class DefiLlamaClient:
    def __init__(
        self,
        base_url: str,
        pools_path: str,
        timeout_seconds: float,
        min_tvl_usd: float = 0.0,
        max_apy_percent: float = 500.0,
    ) -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout_seconds)
        self._pools_path = pools_path
        self._min_tvl_usd = Decimal(str(min_tvl_usd))
        self._max_apy_percent = Decimal(str(max_apy_percent))
        self._logger = logging.getLogger("orca_common.market.defillama")

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def fetch_markets(self) -> list[YieldMarket]:
        response = await self._client.get(self._pools_path, headers={"Accept": "application/json"})
        response.raise_for_status()
        payload = response.json()
        markets = self._parse_markets(payload)
        self._logger.info("DefiLlama parsed_markets=%d min_tvl_usd=%s", len(markets), str(self._min_tvl_usd))
        if markets:
            top = sorted(markets, key=lambda item: item.apy, reverse=True)[:3]
            sample = [
                f"{item.protocol}@{item.chain_name}:apy={item.apy} util={item.utilization} tvl={item.tvl_usdc}"
                for item in top
            ]
            self._logger.info("DefiLlama top_markets=%s", " | ".join(sample))
        return markets

    def _parse_markets(self, payload: Any) -> list[YieldMarket]:
        if isinstance(payload, dict):
            items = payload.get("data", [])
        elif isinstance(payload, list):
            items = payload
        else:
            items = []

        markets: list[YieldMarket] = []
        skipped_insane_apy = 0
        now = int(time())
        for item in items:
            if not isinstance(item, dict):
                continue

            protocol = self._map_protocol(item)
            if not protocol:
                continue

            chain_name = str(item.get("chain", "")).strip()
            chain_id = self._resolve_chain_id(chain_name, item.get("chainId"))
            if chain_id is None:
                continue

            apy_raw = self._to_decimal(item.get("apy"), default=Decimal("0"))
            apy, ok = self._normalize_apy_percent(apy_raw)
            if not ok:
                skipped_insane_apy += 1
                continue
            tvl_usd = self._to_decimal(item.get("tvlUsd"), default=Decimal("0"))
            if tvl_usd < self._min_tvl_usd:
                continue

            utilization = self._derive_utilization(item)
            timestamp = int(item.get("timestamp") or now)

            markets.append(
                YieldMarket(
                    chain_id=chain_id,
                    chain_name=chain_name.lower(),
                    protocol=protocol,  # type: ignore[arg-type]
                    apy=apy,
                    tvl_usdc=tvl_usd,
                    utilization=utilization,
                    timestamp=timestamp,
                )
            )
        if skipped_insane_apy:
            self._logger.info(
                "DefiLlama skipped_insane_apy=%d (raw apy > %s or <= 0; yields API reports APY as percent)",
                skipped_insane_apy,
                str(self._max_apy_percent),
            )
        return markets

    def _normalize_apy_percent(self, apy_percent: Decimal) -> tuple[Decimal, bool]:
        """DefiLlama /pools `apy` is APY in percent (5.2 => 5.2%%). ORCA uses decimal fraction (0.052 => 5.2%%)."""
        if apy_percent <= 0:
            return Decimal("0"), False
        if apy_percent > self._max_apy_percent:
            return Decimal("0"), False
        return (apy_percent / Decimal("100")).quantize(Decimal("0.0000001")), True

    @staticmethod
    def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
        if value is None:
            return default
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return default

    @staticmethod
    def _map_protocol(item: dict[str, Any]) -> str | None:
        text = f"{item.get('project', '')} {item.get('symbol', '')} {item.get('pool', '')}".lower()
        for needle, mapped in PROTOCOL_MAP:
            if needle in text:
                return mapped
        return None

    @staticmethod
    def _resolve_chain_id(chain_name: str, raw_chain_id: Any) -> int | None:
        if isinstance(raw_chain_id, int):
            return raw_chain_id
        if isinstance(raw_chain_id, str) and raw_chain_id.isdigit():
            return int(raw_chain_id)
        return CHAIN_ID_BY_DEFILLAMA_NAME.get(chain_name.lower())

    def _derive_utilization(self, item: dict[str, Any]) -> Decimal:
        explicit = self._to_decimal(item.get("utilization"), default=Decimal("-1"))
        if explicit >= 0:
            return self._clamp_ratio(explicit)

        borrow = self._to_decimal(item.get("totalBorrowUsd"), default=Decimal("-1"))
        supply = self._to_decimal(item.get("totalSupplyUsd"), default=Decimal("-1"))
        if borrow >= 0 and supply > 0:
            return self._clamp_ratio(borrow / supply)

        return Decimal("0")

    @staticmethod
    def _clamp_ratio(value: Decimal) -> Decimal:
        if value < 0:
            return Decimal("0")
        if value > 1:
            return Decimal("1")
        return value

    async def close(self) -> None:
        await self._client.aclose()
