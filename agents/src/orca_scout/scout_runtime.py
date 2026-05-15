from __future__ import annotations

import asyncio
import logging

from redis.asyncio import Redis

from orca_common.registry_client import OrcaRegistryReader
from orca_scout.config import ScoutConfig
from orca_scout.integrations.bridge_fee_client import BridgeFeeClient
from orca_scout.integrations.defillama_client import DefiLlamaClient
from orca_scout.integrations.goldsky_client import GoldskyClient
from orca_scout.integrations.lucid_client import LucidClient
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.integrations.protocol_enrichers import (
    AaveUtilizationEnricher,
    CompoundUtilizationEnricher,
    MorphoUtilizationEnricher,
    UniswapUtilizationEnricher,
)
from orca_scout.integrations.x402_client import X402Client
from orca_scout.services.bridge_cost_estimator import BridgeCostEstimator
from orca_scout.services.opportunity_ranker import OpportunityRanker
from orca_scout.services.execution_intent_builder import ExecutionIntentBuilder
from orca_scout.services.llm_opportunity_selector import LLMOpportunitySelector, pick_with_fallback
from orca_scout.services.passport_signer import PassportSigner
from orca_scout.services.poai_reporter import PoAIReporter
from orca_scout.services.signal_broadcaster import SignalBroadcaster
from orca_scout.services.yield_scanner import YieldScanner


class ScoutRuntime:
    def __init__(self, config: ScoutConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_scout.runtime")

        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        if config.scout_market_data_provider == "hybrid":
            self._market_feed = DefiLlamaClient(
                config.defillama_api_base_url,
                config.defillama_pools_path,
                config.defillama_timeout_seconds,
                config.defillama_min_tvl_usd,
            )
            self._enrichers = [
                AaveUtilizationEnricher(
                    config.aave_data_api_base_url,
                    config.aave_data_api_key,
                    config.defillama_timeout_seconds,
                ),
                CompoundUtilizationEnricher(
                    config.compound_data_api_base_url,
                    config.defillama_timeout_seconds,
                ),
                MorphoUtilizationEnricher(
                    config.morpho_data_api_base_url,
                    config.defillama_timeout_seconds,
                ),
                UniswapUtilizationEnricher(
                    config.uniswap_data_api_base_url,
                    config.defillama_timeout_seconds,
                ),
            ]
        else:
            self._market_feed = LucidClient(
                config.lucid_api_base_url,
                config.lucid_api_key,
                config.lucid_timeout_seconds,
                config.lucid_market_path,
            )
            self._enrichers = []
        self._goldsky = GoldskyClient(
            config.goldsky_api_base_url,
            config.goldsky_api_key,
            config.goldsky_timeout_seconds,
            config.goldsky_query_path,
            config.goldsky_subgraph_id,
        )
        self._bridge_fee: BridgeFeeClient | None = None
        if config.bridge_fee_api_base_url and config.bridge_fee_api_key:
            self._bridge_fee = BridgeFeeClient(
                config.bridge_fee_api_base_url,
                config.bridge_fee_api_key,
                config.bridge_fee_path,
                config.bridge_fee_timeout_seconds,
                config.bridge_fee_response_field,
                config.bridge_fee_asset_param,
            )
        else:
            self._logger.warning(
                "Bridge fee service not configured; bridge cost deduction disabled (assumed 0 APY impact)."
            )
        self._x402 = X402Client(
            config.x402_service_url,
            config.x402_execute_path,
            config.passport_cli_bin,
            dry_run=config.x402_dry_run,
        )
        if config.x402_dry_run:
            self._logger.warning(
                "X402_DRY_RUN=true: Scout micropayments are simulated (no kpass HTTP execute). "
                "Unset for production paid flows."
            )
        self._passport = PassportCLI(config.passport_cli_bin)
        self._poai = PoAIClient(
            config.kite_rpc_url,
            config.kite_chain_id,
            config.poai_contract_address,
            config.scout_private_key,
        )

        self._scanner = YieldScanner(self._market_feed, self._goldsky, self._enrichers)
        self._estimator = BridgeCostEstimator(self._bridge_fee, config.settlement_asset_symbol)
        allowed_routes = None if config.scout_disable_route_filter else config.allowed_route_pairs_set()
        if allowed_routes is None:
            self._logger.warning("Route filter disabled (SCOUT_DISABLE_ROUTE_FILTER=true): demo mode is active.")
        self._ranker = OpportunityRanker(self._estimator, allowed_routes)
        self._llm_selector: LLMOpportunitySelector | None = None
        if config.scout_llm_enabled:
            self._llm_selector = LLMOpportunitySelector(
                api_key=config.groq_api_key,
                model=config.groq_model,
                base_url=config.groq_base_url,
                timeout_seconds=config.groq_timeout_seconds,
                max_candidates=config.groq_max_candidates,
            )
        self._intent_builder = ExecutionIntentBuilder(
            enabled=config.execution_intent_enabled,
            client_agent_vault_address=config.client_agent_vault_address,
            orca_oapp_address=config.orca_oapp_address,
            protocol_map_raw=config.protocol_address_map,
            trusted_remotes_raw=config.trusted_remote_map,
            hook_metadata_hex=config.execution_hook_metadata_hex,
            tx_value_wei=config.execution_tx_value_wei,
            artifact_path=config.scout_routes_artifact_path,
        )
        self._signer = PassportSigner(
            config.scout_did,
            config.scout_private_key,
            config.kite_chain_id,
            config.signal_domain_name,
            config.signal_domain_version,
        )
        self._broadcaster = SignalBroadcaster(
            self._redis,
            config.redis_stream_key,
            self._x402,
            config.risk_agent_did,
            config.x402_network,
            config.x402_asset_address,
            config.x402_max_amount_required_wei,
        )
        self._registry_gate: OrcaRegistryReader | None = None
        if config.scout_require_registry:
            self._registry_gate = OrcaRegistryReader(config.kite_rpc_url, config.orca_registry_address)
        self._poai_reporter = PoAIReporter(self._poai, config.scout_epoch_id, self._signer.did_hash())

    async def run_forever(self) -> None:
        self._logger.info("Starting Scout runtime loop.")
        await self._run_startup_preflight()
        while True:
            self._ensure_passport_session()
            await self._run_single_scan()
            await asyncio.sleep(self._config.scan_interval_seconds)

    def _ensure_passport_session(self) -> None:
        session_id = self._passport.ensure_active_session(
            task_summary=self._config.passport_session_task_summary,
            max_per_tx=self._config.passport_session_max_per_tx,
            max_total=self._config.passport_session_max_total,
            ttl=self._config.passport_session_ttl,
            assets=self._config.passport_session_assets,
        )
        self._logger.info("Using Passport session: %s", session_id)

    async def _run_startup_preflight(self) -> None:
        try:
            await self._redis.ping()
            self._logger.info("Redis preflight OK.")
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Redis preflight failed: {exc}") from exc

        try:
            self._passport.check_ready()
            self._logger.info("Passport CLI preflight OK.")
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Passport preflight failed: {exc}") from exc

        if not self._poai.is_connected():
            raise RuntimeError("Kite RPC preflight failed: web3 provider is not connected")
        self._logger.info("Kite RPC preflight OK.")

    async def _run_single_scan(self) -> None:
        markets = await self._scanner.scan()
        if not markets:
            self._logger.warning("No markets received from market providers/Goldsky.")
            return

        ranked = await self._ranker.rank(
            markets=markets,
            min_net_delta_apy=self._config.min_net_delta_apy,
            suggested_amount_usdc=self._config.default_suggested_amount,
            max_suggested_amount_usdc=self._config.max_suggested_amount,
        )
        if not ranked:
            self._logger.info("No opportunities passed threshold %.4f.", self._config.min_net_delta_apy)
            return

        best = ranked[0]
        self._logger.info(
            "Deterministic best=%s@%d->%s@%d net_delta=%s",
            best.src_protocol,
            best.src_chain,
            best.dst_protocol,
            best.dst_chain,
            str(best.net_delta_apy),
        )
        if self._llm_selector is not None:
            llm_choice = await self._llm_selector.select_best(ranked)
            best = pick_with_fallback(ranked, llm_choice) or ranked[0]
            self._logger.info(
                "LLM-selected best=%s@%d->%s@%d net_delta=%s",
                best.src_protocol,
                best.src_chain,
                best.dst_protocol,
                best.dst_chain,
                str(best.net_delta_apy),
            )
        intent = self._intent_builder.build(best)
        if self._registry_gate is not None:
            active = await asyncio.to_thread(
                self._registry_gate.is_active_agent_for_did_string,
                self._config.scout_did,
            )
            if not active:
                self._logger.warning(
                    "Skipping broadcast: SCOUT_REQUIRE_REGISTRY=true but SCOUT_DID is inactive on ORCARegistry."
                )
                return
        signal = self._signer.sign_opportunity(best, execution_intent=intent)
        event_id, signal_hash = await self._broadcaster.broadcast(signal)
        poai_tx = await asyncio.to_thread(self._poai_reporter.report_signal, signal, signal_hash)

        self._logger.info(
            "Published signal_id=%s event_id=%s net_delta_apy=%s intent=%s poai_tx=%s",
            signal.signal_id,
            event_id,
            str(signal.net_delta_apy),
            "yes" if signal.execution_intent else "no",
            poai_tx,
        )

    async def close(self) -> None:
        await self._redis.aclose()
        close_feed = getattr(self._market_feed, "close", None)
        if close_feed is not None:
            await close_feed()
        for enricher in self._enrichers:
            await enricher.close()
        await self._goldsky.close()
        if self._bridge_fee is not None:
            await self._bridge_fee.close()
        if self._llm_selector is not None:
            await self._llm_selector.close()
        await self._x402.close()
