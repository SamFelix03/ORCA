from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

import httpx
import asyncio

from pydantic import BaseModel

from orca_common.market.factory import build_market_stack
from orca_common.market.feed_stub_chain import find_market_for_exec_chain
from orca_common.models.market import YieldMarket
from orca_common.registry_client import OrcaRegistryReader
from orca_risk.config import RiskConfig
from orca_scout.models import YieldSignal


class RiskEvidencePack(BaseModel):
    signal_id: str
    scout_did: str
    route: dict[str, Any]
    signal_claimed: dict[str, str]
    live_markets: dict[str, dict[str, str] | None]
    fresh_computed: dict[str, str]
    drift: dict[str, str]
    preflight: dict[str, bool]
    api_context: dict[str, Any]
    registry: dict[str, Any]


class RiskContextBuilder:
    def __init__(self, config: RiskConfig, registry: OrcaRegistryReader | None) -> None:
        self._config = config
        self._registry = registry
        self._logger = logging.getLogger("orca_risk.context")
        self._feed, self._enrichers, self._goldsky, self._estimator = build_market_stack(config)
        self._http = httpx.AsyncClient(timeout=15.0)

    async def build(self, signal: YieldSignal) -> RiskEvidencePack:
        markets = await self._feed.fetch_markets()
        for enricher in self._enrichers:
            markets = await enricher.enrich(markets)
        if self._goldsky is not None:
            await self._goldsky.fetch_recent_protocol_events()

        feed_to_stub = self._config.feed_to_stub_chain_remap()
        src, src_feed_chain = find_market_for_exec_chain(
            markets, signal.src_chain, str(signal.src_protocol), feed_to_stub
        )
        dst, dst_feed_chain = find_market_for_exec_chain(
            markets, signal.dst_chain, str(signal.dst_protocol), feed_to_stub
        )
        kite_chain = self._config.kite_chain_id
        src_anchor = src is None and signal.src_chain == kite_chain
        markets_found = dst is not None and (src is not None or src_anchor)
        if src is None and not src_anchor:
            self._logger.warning(
                "Risk: no live market for src %s@%s (feed remap tried)",
                signal.src_protocol,
                signal.src_chain,
            )
        if dst is None:
            self._logger.warning(
                "Risk: no live market for dst %s@%s (feed remap tried)",
                signal.dst_protocol,
                signal.dst_chain,
            )
        elif dst_feed_chain is not None and dst_feed_chain != signal.dst_chain:
            self._logger.info(
                "Risk: resolved dst %s exec_chain=%s via feed_chain=%s",
                signal.dst_protocol,
                signal.dst_chain,
                dst_feed_chain,
            )

        fresh_bridge_apy = await self._estimator.estimate_annualized_cost_apy(
            signal.src_chain, signal.dst_chain, signal.suggested_amount
        )
        fresh_current = src.apy if src else signal.current_apy
        fresh_target = dst.apy if dst else signal.target_apy
        fresh_net = fresh_target - fresh_current - fresh_bridge_apy

        apy_drift_bps = int(abs((fresh_target - signal.target_apy) + (fresh_current - signal.current_apy)) * 100)
        net_drift_bps = int(abs(fresh_net - signal.net_delta_apy) * 100)

        min_tvl = Decimal(str(self._config.defillama_min_tvl_usd))
        tvl_ok = True
        util_ok = True
        if src:
            tvl_ok = tvl_ok and src.tvl_usdc >= min_tvl
            util_ok = util_ok and src.utilization <= Decimal(str(self._config.risk_max_utilization))
        if dst:
            tvl_ok = tvl_ok and dst.tvl_usdc >= min_tvl
            util_ok = util_ok and dst.utilization <= Decimal(str(self._config.risk_max_utilization))

        api_context = await self._fetch_api_context(signal)
        registry_ctx: dict[str, Any] = {"scout_active": True, "scout_vault": None}
        if self._registry is not None:
            registry_ctx["scout_active"] = await asyncio.to_thread(
                self._registry.is_active_agent_for_did_string, signal.scout_did
            )
            registry_ctx["scout_vault"] = await asyncio.to_thread(
                self._registry.get_vault_for_did_string, signal.scout_did
            )

        preflight = {
            "markets_found_for_route": markets_found,
            "fresh_net_delta_apy_positive": fresh_net > 0,
            "signal_net_delta_apy_positive": signal.net_delta_apy > 0,
            "apy_drift_within_tolerance": apy_drift_bps <= self._config.risk_max_apy_drift_bps,
            "min_tvl_ok": tvl_ok,
            "utilization_below_cap": util_ok,
        }

        pack = RiskEvidencePack(
            signal_id=signal.signal_id,
            scout_did=signal.scout_did,
            route={
                "src_chain": signal.src_chain,
                "dst_chain": signal.dst_chain,
                "src_protocol": signal.src_protocol,
                "dst_protocol": signal.dst_protocol,
                "suggested_amount": signal.suggested_amount,
                "market_resolution": {
                    "src_feed_chain": src_feed_chain,
                    "dst_feed_chain": dst_feed_chain,
                    "src_anchor_kite": src_anchor,
                },
            },
            signal_claimed={
                "current_apy": str(signal.current_apy),
                "target_apy": str(signal.target_apy),
                "net_delta_apy": str(signal.net_delta_apy),
            },
            live_markets={
                "src": self._market_dict(src),
                "dst": self._market_dict(dst),
            },
            fresh_computed={
                "current_apy": str(fresh_current),
                "target_apy": str(fresh_target),
                "annualized_bridge_cost_apy": str(fresh_bridge_apy),
                "fresh_net_delta_apy": str(fresh_net),
            },
            drift={
                "apy_drift_bps": str(apy_drift_bps),
                "net_delta_drift_bps": str(net_drift_bps),
                "max_apy_drift_bps": str(self._config.risk_max_apy_drift_bps),
            },
            preflight=preflight,
            api_context=api_context,
            registry=registry_ctx,
        )
        self._logger.info("Risk evidence pack built signal_id=%s preflight=%s", signal.signal_id, preflight)
        return pack

    async def _fetch_api_context(self, signal: YieldSignal) -> dict[str, Any]:
        base = self._config.orca_api_base_url.strip().rstrip("/")
        if not base:
            return {"available": False}
        headers: dict[str, str] = {}
        key = self._config.orca_internal_api_key.strip()
        if key:
            headers["x-orca-internal-key"] = key
        try:
            response = await self._http.get(
                f"{base}/internal/risk-context",
                params={"signalId": signal.signal_id},
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            self._logger.warning("Risk API context fetch failed: %s", exc)
            return {"available": False, "error": str(exc)}

    @staticmethod
    def _market_dict(market: YieldMarket | None) -> dict[str, str] | None:
        if market is None:
            return None
        return {
            "chain_id": str(market.chain_id),
            "protocol": market.protocol,
            "apy": str(market.apy),
            "tvl_usdc": str(market.tvl_usdc),
            "utilization": str(market.utilization),
            "timestamp": str(market.timestamp),
        }

    async def close(self) -> None:
        close_feed = getattr(self._feed, "close", None)
        if close_feed is not None:
            await close_feed()
        for enricher in self._enrichers:
            await enricher.close()
        if self._goldsky is not None:
            await self._goldsky.close()
        bridge = getattr(self._estimator, "_fee_client", None)
        if bridge is not None:
            await bridge.close()
        await self._http.aclose()
