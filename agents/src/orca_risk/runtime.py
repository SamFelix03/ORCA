from __future__ import annotations

import asyncio
import json
import logging
import uuid
from hashlib import sha256

from redis.asyncio import Redis

from orca_common.events import RiskInstruction, RiskInstructionEvent, ScoutSignalEvent
from orca_common.llm import GroqDeliberationClient
from orca_common.registry_client import OrcaRegistryReader
from orca_common.signing import DIDMessageSigner
from orca_risk.config import RiskConfig
from orca_risk.demo import DEMO_APPROVAL_REASON
from orca_risk.services.risk_context_builder import RiskContextBuilder
from orca_risk.services.risk_llm_advisor import RiskLlmAdvisor
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.x402_client import X402Client


class RiskRuntime:
    def __init__(self, config: RiskConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_risk.runtime")
        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._x402 = X402Client(
            service_url=config.x402_service_url,
            execute_path=config.x402_execute_path,
            kpass_bin=config.passport_cli_bin,
            dry_run=config.x402_dry_run,
            passport_base_url=config.kite_passport_base_url,
            execution_mode=config.x402_execution_mode,
            signer_private_key=config.risk_private_key,
            facilitator_address=config.x402_facilitator_address,
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            token_name_fallback=config.x402_token_name_fallback,
            token_version_fallback=config.x402_token_version_fallback,
        )
        if config.x402_dry_run:
            self._logger.warning("X402_DRY_RUN=true: Risk micropayments are simulated.")
        self._passport = PassportCLI(config.passport_cli_bin, base_url=config.kite_passport_base_url)
        self._signer = DIDMessageSigner(
            did=config.risk_did,
            private_key=config.risk_private_key,
            chain_id=config.kite_chain_id,
            domain_name=config.signal_domain_name,
            domain_version=config.signal_domain_version,
        )
        reg_addr = config.orca_registry_address.strip()
        rpc_url = config.kite_rpc_url.strip()
        self._registry: OrcaRegistryReader | None = None
        if reg_addr:
            self._registry = OrcaRegistryReader(rpc_url, reg_addr)
        groq = GroqDeliberationClient(
            api_key=config.groq_api_key,
            model=config.groq_model,
            base_url=config.groq_base_url,
            timeout_seconds=config.groq_timeout_seconds,
        )
        self._context_builder = RiskContextBuilder(config, self._registry)
        self._llm_advisor = RiskLlmAdvisor(groq, demo_mode=config.demo_mode)
        if config.demo_mode:
            self._logger.warning(
                "DEMO_MODE=true: Risk will auto-approve all signals (LLM demo prompt + code override). "
                "Do not use in production."
            )

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
        mode = "DEMO (auto-approve)" if self._config.demo_mode else "production"
        self._logger.info(
            "Risk runtime ready [%s]. Subscribing to Redis stream %r (new messages only); "
            "instructions go to %r. Blocking up to 30s waiting for Scout signals.",
            mode,
            self._config.scout_signal_stream_key,
            self._config.risk_instruction_stream_key,
        )
        first_cycle = True
        while True:
            if first_cycle:
                self._logger.info("Risk: establishing Passport session (may wait if session creation is pending)…")
                first_cycle = False
            await self._ensure_passport_session()
            stream_data = await self._redis.xread(
                {self._config.scout_signal_stream_key: "$"},
                block=30_000,
                count=20,
            )
            if not stream_data:
                self._logger.info(
                    "Risk: idle — no new Scout messages on %r (will retry).",
                    self._config.scout_signal_stream_key,
                )
                continue
            for _, records in stream_data:
                for event_id, fields in records:
                    payload_raw = fields.get(b"payload")
                    if not payload_raw:
                        raise RuntimeError(f"Risk received malformed stream event without payload at {event_id!r}")
                    payload = json.loads(payload_raw.decode("utf-8"))
                    await self._handle_signal_event(payload)

    async def _run_startup_preflight(self) -> None:
        await self._redis.ping()
        self._logger.info("Risk Redis preflight OK.")
        self._passport.check_ready()
        self._logger.info("Risk Passport CLI preflight OK.")

    async def _ensure_passport_session(self) -> None:
        self._passport.ensure_active_session(
            task_summary=self._config.passport_session_task_summary,
            max_per_tx=self._config.passport_session_max_per_tx,
            max_total=self._config.passport_session_max_total,
            ttl=self._config.passport_session_ttl,
            assets=self._config.passport_session_assets,
        )

    async def _handle_signal_event(self, payload: dict[str, object]) -> None:
        signal_event = ScoutSignalEvent.model_validate(payload)
        signal = signal_event.signal

        evidence = await self._context_builder.build(signal)
        llm_deliberation = await self._llm_advisor.deliberate(evidence)

        if self._config.demo_mode:
            approved = True
            llm_reason = str(llm_deliberation.verdict.get("reason", llm_deliberation.verdict_summary))
            reason = f"Demo approve: {llm_reason}"
            if signal.execution_intent is None:
                self._logger.warning(
                    "Demo mode approved signal_id=%s but execution_intent is missing; "
                    "Executor may still skip.",
                    signal.signal_id,
                )
        else:
            recommended = bool(llm_deliberation.verdict.get("recommended_approved", False))
            llm_reason = str(llm_deliberation.verdict.get("reason", llm_deliberation.verdict_summary))

            registry_ok = True
            if self._registry is not None:
                registry_ok = bool(evidence.registry.get("scout_active", True))
            allow_raw = self._config.risk_scout_did_allowlist.strip()
            if allow_raw:
                allowed = {d.strip() for d in allow_raw.split(",") if d.strip()}
                allowlist_ok = signal.scout_did.strip() in allowed
            else:
                allowlist_ok = True

            pf = evidence.preflight
            approved = (
                recommended
                and registry_ok
                and allowlist_ok
                and pf["fresh_net_delta_apy_positive"]
                and pf["signal_net_delta_apy_positive"]
                and pf["apy_drift_within_tolerance"]
                and pf["markets_found_for_route"]
                and pf["min_tvl_ok"]
                and pf["utilization_below_cap"]
            )

            if not registry_ok:
                reason = "Rejected: scout DID not active on ORCARegistry"
            elif allow_raw and not allowlist_ok:
                reason = "Rejected: scout DID not in RISK_SCOUT_DID_ALLOWLIST"
            elif not pf["markets_found_for_route"]:
                reason = "Rejected: live market data missing for route"
            elif not pf["signal_net_delta_apy_positive"] or not pf["fresh_net_delta_apy_positive"]:
                reason = "Rejected: non-positive net delta (signal or fresh)"
            elif not pf["apy_drift_within_tolerance"]:
                reason = f"Rejected: APY drift exceeds {self._config.risk_max_apy_drift_bps} bps"
            elif not pf["min_tvl_ok"]:
                reason = "Rejected: TVL below minimum threshold"
            elif not pf["utilization_below_cap"]:
                reason = "Rejected: utilization above risk cap"
            elif not recommended:
                reason = f"Rejected by risk LLM: {llm_reason}"
            else:
                reason = f"Approved by risk LLM: {llm_reason}"

        instruction_id = str(uuid.uuid4())
        signature, timestamp = self._signer.sign_instruction(
            instruction_id=instruction_id,
            signal_id=signal.signal_id,
            executor_did=self._config.executor_agent_did,
            approved=approved,
            reason=reason,
        )
        instruction = RiskInstruction(
            instruction_id=instruction_id,
            signal_id=signal.signal_id,
            risk_did=self._config.risk_did,
            executor_did=self._config.executor_agent_did,
            approved=approved,
            reason=reason,
            src_chain=signal.src_chain,
            dst_chain=signal.dst_chain,
            src_protocol=signal.src_protocol,
            dst_protocol=signal.dst_protocol,
            suggested_amount=signal.suggested_amount,
            net_delta_apy=signal.net_delta_apy,
            execution_intent=signal.execution_intent,
            signature=signature,
            timestamp=timestamp,
        )
        payment = await self._x402.send_micropayment(
            to_did=self._config.executor_agent_did,
            amount_wei=self._config.x402_max_amount_required_wei,
            network=self._config.x402_network,
            asset_address=self._config.x402_asset_address,
            signal_id=signal.signal_id,
        )
        payment_tx_hash = str(payment.get("txHash", ""))
        if not payment_tx_hash:
            raise RuntimeError("Risk x402 payment succeeded without txHash; strict mode requires tx hash.")

        source_signal_hash = sha256(json.dumps(signal.to_wire(), sort_keys=True).encode("utf-8")).hexdigest()
        out_event = RiskInstructionEvent(
            event="risk.instruction.created",
            instruction=instruction,
            sourceSignalHash=source_signal_hash,
            paymentTxHash=payment_tx_hash,
            paymentAmountWei=str(self._config.x402_max_amount_required_wei),
            paymentAsset=self._config.x402_asset_address,
            paymentNetwork=self._config.x402_network,
            llm_deliberation=llm_deliberation,
        )
        await self._redis.xadd(
            self._config.risk_instruction_stream_key,
            {"payload": out_event.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )
        self._logger.info(
            "Published risk instruction signal_id=%s instruction_id=%s approved=%s",
            signal.signal_id,
            instruction_id,
            approved,
        )

    async def close(self) -> None:
        await self._context_builder.close()
        await self._llm_advisor.close()
        await self._x402.close()
        await self._redis.aclose()
