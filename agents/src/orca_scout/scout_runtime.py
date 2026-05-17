from __future__ import annotations

import asyncio
import json
import logging

import httpx
from redis.asyncio import Redis

from orca_common.registry_client import OrcaRegistryReader
from orca_scout.config import ScoutConfig
from orca_common.llm import GroqDeliberationClient
from orca_common.market import (
    AaveUtilizationEnricher,
    BridgeCostEstimator,
    BridgeFeeClient,
    CompoundUtilizationEnricher,
    DefiLlamaClient,
    GoldskyClient,
    LucidClient,
    MorphoUtilizationEnricher,
    UniswapUtilizationEnricher,
)
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.integrations.x402_client import X402Client
from orca_scout.services.opportunity_ranker import OpportunityRanker
from orca_scout.services.execution_intent_builder import ExecutionIntentBuilder
from orca_scout.services.llm_opportunity_selector import LLMOpportunitySelector
from orca_scout.services.passport_signer import PassportSigner
from orca_scout.services.poai_reporter import PoAIReporter
from orca_scout.services.signal_broadcaster import SignalBroadcaster
from orca_scout.services.yield_scanner import YieldScanner


class ScoutRuntime:
    def __init__(self, config: ScoutConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_scout.runtime")
        
        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._buyer_signal_redis: Redis | None = None
        if config.scout_market_data_provider == "hybrid":
            self._market_feed = DefiLlamaClient(
                config.defillama_api_base_url,
                config.defillama_pools_path,
                config.defillama_timeout_seconds,
                config.defillama_min_tvl_usd,
                config.defillama_max_apy_percent,
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
            passport_base_url=config.kite_passport_base_url,
            execution_mode=config.x402_execution_mode,
            signer_private_key=config.scout_private_key,
            facilitator_address=config.x402_facilitator_address,
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            token_name_fallback=config.x402_token_name_fallback,
            token_version_fallback=config.x402_token_version_fallback,
        )
        if config.x402_dry_run:
            self._logger.warning(
                "X402_DRY_RUN=true: Scout micropayments are simulated (no kpass HTTP execute). "
                "Unset for production paid flows."
            )
        self._passport = PassportCLI(config.passport_cli_bin, base_url=config.kite_passport_base_url)
        self._poai = PoAIClient(
            config.kite_rpc_url,
            config.kite_chain_id,
            config.poai_contract_address,
            config.scout_private_key,
        )

        self._scanner = YieldScanner(self._market_feed, self._goldsky, enrichers=self._enrichers)
        self._estimator = BridgeCostEstimator(self._bridge_fee, config.settlement_asset_symbol)
        allowed_routes = None if config.scout_disable_route_filter else config.allowed_route_pairs_set()
        if allowed_routes is None:
            self._logger.warning("Route filter disabled (SCOUT_DISABLE_ROUTE_FILTER=true): demo mode is active.")
        self._ranker = OpportunityRanker(self._estimator, allowed_routes)
        groq_client = GroqDeliberationClient(
            api_key=config.groq_api_key,
            model=config.groq_model,
            base_url=config.groq_base_url,
            timeout_seconds=config.groq_timeout_seconds,
        )
        self._llm_selector = LLMOpportunitySelector(
            client=groq_client,
            max_candidates=config.groq_max_candidates,
        )
        self._intent_builder = ExecutionIntentBuilder(
            enabled=config.execution_intent_enabled,
            client_agent_vault_address=config.client_agent_vault_address,
            orca_oapp_address=config.orca_oapp_address,
            protocol_map_raw=config.resolved_protocol_address_map(),
            trusted_remotes_raw=config.trusted_remote_map,
            hook_metadata_hex=config.execution_hook_metadata_hex,
            tx_value_wei=config.execution_tx_value_wei,
            cross_chain_beneficiary=config.cross_chain_beneficiary_address,
            kite_chain_id=config.kite_chain_id,
            kite_rpc_url=config.kite_rpc_url,
        )
        self._signer = PassportSigner(
            config.scout_did,
            config.scout_private_key,
            config.kite_chain_id,
            config.signal_domain_name,
            config.signal_domain_version,
        )
        self._broadcaster: SignalBroadcaster | None = None
        self._signal_broadcast_stream_key = config.redis_stream_key
        self._registry_gate: OrcaRegistryReader | None = None
        if config.scout_require_registry:
            self._registry_gate = OrcaRegistryReader(config.kite_rpc_url, config.orca_registry_address)
        self._poai_reporter = PoAIReporter(self._poai, config.scout_epoch_id, self._signer.did_hash())

    @staticmethod
    def _subscriber_binding_config(cfg: ScoutConfig) -> bool:
        return bool(
            cfg.scout_purchase_id.strip()
            and cfg.scout_binding_secret.strip()
            and cfg.binding_api_base_url.strip()
        )

    async def _poll_buyer_binding_until_ready(self) -> tuple[Redis, str]:
        base = self._config.binding_api_base_url.rstrip("/")
        url = f"{base}/scouts/purchases/{self._config.scout_purchase_id.strip()}/binding"
        headers = {"X-Orca-Binding-Secret": self._config.scout_binding_secret.strip()}
        delay = 1.0
        self._logger.info("Subscriber mode: polling %s until buyer binds Redis…", url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                response = await client.get(url, headers=headers)
                if response.status_code == 404:
                    self._logger.info(
                        "Buyer binding not ready yet (HTTP 404); retrying in %.1fs.",
                        delay,
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * 1.5, 60.0)
                    continue
                if response.status_code == 401:
                    raise RuntimeError("Binding fetch rejected (401): missing X-Orca-Binding-Secret.")
                if response.status_code == 403:
                    raise RuntimeError("Binding fetch rejected (403): invalid SCOUT_BINDING_SECRET.")
                response.raise_for_status()
                payload = response.json()
                redis_url = str(payload.get("redisUrl", "")).strip()
                stream_key = str(payload.get("scoutSignalStreamKey", "") or self._config.redis_stream_key).strip()
                if not redis_url:
                    self._logger.warning("Binding response missing redisUrl; retrying in %.1fs.", delay)
                    await asyncio.sleep(delay)
                    delay = min(delay * 1.5, 60.0)
                    continue
                buyer_redis = Redis.from_url(redis_url, decode_responses=False)
                self._buyer_signal_redis = buyer_redis
                self._signal_broadcast_stream_key = stream_key
                return buyer_redis, stream_key

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
        if self._subscriber_binding_config(self._config):
            broadcast_redis, stream_key = await self._poll_buyer_binding_until_ready()
            try:
                await broadcast_redis.ping()
                self._logger.info("Buyer signal Redis preflight OK (stream %r).", stream_key)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Buyer signal Redis preflight failed: {exc}") from exc
            try:
                await self._redis.ping()
                self._logger.info("Local Redis preflight OK.")
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Local Redis preflight failed: {exc}") from exc
        else:
            try:
                await self._redis.ping()
                self._logger.info("Redis preflight OK.")
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(f"Redis preflight failed: {exc}") from exc

        self._broadcaster = SignalBroadcaster(
            self._buyer_signal_redis if self._buyer_signal_redis is not None else self._redis,
            self._signal_broadcast_stream_key,
            self._x402,
            self._config.risk_agent_did,
            self._config.x402_network,
            self._config.x402_asset_address,
            self._config.x402_max_amount_required_wei,
        )

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

        if self._config.scout_opportunity_mode == "best_stub_deposit":
            manifest_path = self._config.orca_stub_protocol_manifest_path.strip()
            manifest_pairs = ScoutConfig.stub_manifest_allowed_chain_protocol_pairs(manifest_path)
            remap = self._config.feed_to_stub_chain_remap()
            ranked = self._ranker.rank_feed_to_stub_deposit(
                markets,
                manifest_pairs,
                remap,
                suggested_amount_usdc=self._config.default_suggested_amount,
                max_suggested_amount_usdc=self._config.max_suggested_amount,
                kite_chain_id=self._config.kite_chain_id,
                kite_anchor_protocol=self._config.scout_kite_anchor_protocol,  # type: ignore[arg-type]
                max_candidates=self._config.scout_feed_rank_max_candidates,
            )
            if not ranked and self._config.scout_stub_apy_fallback:
                self._logger.warning(
                    "Feed-ranked stub: no eligible pools; falling back to on-chain stub apyBps (SCOUT_STUB_APY_FALLBACK)."
                )
                from orca_scout.integrations.stub_vault_market_feed import StubVaultMarketFeed

                stub_feed = StubVaultMarketFeed(
                    manifest_path,
                    self._config.stub_chain_rpc_by_id(),
                )
                stub_markets = await stub_feed.fetch_markets()
                ranked = self._ranker.rank_best_stub_deposit(
                    stub_markets,
                    suggested_amount_usdc=self._config.default_suggested_amount,
                    max_suggested_amount_usdc=self._config.max_suggested_amount,
                    kite_chain_id=self._config.kite_chain_id,
                    kite_anchor_protocol=self._config.scout_kite_anchor_protocol,  # type: ignore[arg-type]
                )
            ranked = [r for r in ranked if r.net_delta_apy >= self._config.min_net_delta_apy]
        else:
            ranked = await self._ranker.rank(
                markets=markets,
                min_net_delta_apy=self._config.min_net_delta_apy,
                suggested_amount_usdc=self._config.default_suggested_amount,
                max_suggested_amount_usdc=self._config.max_suggested_amount,
            )
        if not ranked:
            self._logger.info("No opportunities passed threshold %.4f.", self._config.min_net_delta_apy)
            return

        best, llm_deliberation = await self._llm_selector.select_best(ranked)
        self._logger.info(
            "LLM-selected best=%s@%d->%s@%d net_delta=%s summary=%s",
            best.src_protocol,
            best.src_chain,
            best.dst_protocol,
            best.dst_chain,
            str(best.net_delta_apy),
            llm_deliberation.verdict_summary,
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
        if self._broadcaster is None:
            raise RuntimeError("SignalBroadcaster not initialized (startup preflight incomplete).")
        event_id, signal_hash = await self._broadcaster.broadcast(signal, llm_deliberation)
        poai_tx = await asyncio.to_thread(self._poai_reporter.report_signal, signal, signal_hash)
        await self._redis.xadd(
            self._config.workflow_event_stream_key,
            {
                "payload": json.dumps(
                    {
                        "event": "scout.poai.recorded",
                        "signalId": signal.signal_id,
                        "agentDid": self._config.scout_did,
                        "agentType": "scout",
                        "title": "Scout PoAI attribution",
                        "summary": "Scout recorded PoAI attribution for the published signal.",
                        "txHash": poai_tx,
                        "chainId": self._config.kite_chain_id,
                        "poaiActionType": "SIGNAL",
                    }
                )
            },
            maxlen=10_000,
            approximate=True,
        )

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
        if self._buyer_signal_redis is not None and self._buyer_signal_redis is not self._redis:
            await self._buyer_signal_redis.aclose()
        close_feed = getattr(self._market_feed, "close", None)
        if close_feed is not None:
            await close_feed()
        for enricher in self._enrichers:
            await enricher.close()
        await self._goldsky.close()
        if self._bridge_fee is not None:
            await self._bridge_fee.close()
        await self._llm_selector.close()
        await self._x402.close()
