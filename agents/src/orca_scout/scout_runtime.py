from __future__ import annotations

import asyncio
import logging

from redis.asyncio import Redis

from orca_scout.config import ScoutConfig
from orca_scout.integrations.bridge_fee_client import BridgeFeeClient
from orca_scout.integrations.goldsky_client import GoldskyClient
from orca_scout.integrations.lucid_client import LucidClient
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.integrations.x402_client import X402Client
from orca_scout.services.bridge_cost_estimator import BridgeCostEstimator
from orca_scout.services.opportunity_ranker import OpportunityRanker
from orca_scout.services.execution_intent_builder import ExecutionIntentBuilder
from orca_scout.services.passport_signer import PassportSigner
from orca_scout.services.poai_reporter import PoAIReporter
from orca_scout.services.signal_broadcaster import SignalBroadcaster
from orca_scout.services.yield_scanner import YieldScanner


class ScoutRuntime:
    def __init__(self, config: ScoutConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_scout.runtime")

        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._lucid = LucidClient(
            config.lucid_api_base_url,
            config.lucid_api_key,
            config.lucid_timeout_seconds,
            config.lucid_market_path,
        )
        self._goldsky = GoldskyClient(
            config.goldsky_api_base_url,
            config.goldsky_api_key,
            config.goldsky_timeout_seconds,
            config.goldsky_query_path,
            config.goldsky_subgraph_id,
        )
        self._bridge_fee = BridgeFeeClient(
            config.bridge_fee_api_base_url,
            config.bridge_fee_api_key,
            config.bridge_fee_path,
            config.bridge_fee_timeout_seconds,
            config.bridge_fee_response_field,
            config.bridge_fee_asset_param,
        )
        self._x402 = X402Client(
            config.x402_service_url,
            config.x402_execute_path,
            config.x402_api_key,
        )
        self._passport = PassportCLI(config.passport_cli_bin)
        self._poai = PoAIClient(
            config.kite_rpc_url,
            config.kite_chain_id,
            config.poai_contract_address,
            config.scout_private_key,
        )

        self._scanner = YieldScanner(self._lucid, self._goldsky)
        self._estimator = BridgeCostEstimator(self._bridge_fee, config.settlement_asset_symbol)
        self._ranker = OpportunityRanker(self._estimator, config.allowed_route_pairs_set())
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
        self._poai_reporter = PoAIReporter(self._poai, config.scout_epoch_id, self._signer.did_hash())

    async def run_forever(self) -> None:
        self._logger.info("Starting Scout runtime loop.")
        await self._run_startup_preflight()
        while True:
            try:
                self._ensure_passport_session()
                await self._run_single_scan()
            except Exception as exc:  # noqa: BLE001
                self._logger.exception("Scout cycle failed: %s", exc)
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
            self._logger.warning("No markets received from Lucid/Goldsky.")
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
        intent = self._intent_builder.build(best)
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
        await self._lucid.close()
        await self._goldsky.close()
        await self._bridge_fee.close()
        await self._x402.close()
