from __future__ import annotations

import asyncio
import json
import logging
import uuid
from hashlib import sha256

from redis.asyncio import Redis

from orca_common.events import RiskInstruction, RiskInstructionEvent, ScoutSignalEvent
from orca_common.registry_client import OrcaRegistryReader
from orca_common.signing import DIDMessageSigner
from orca_risk.config import RiskConfig
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
        )
        if config.x402_dry_run:
            self._logger.warning("X402_DRY_RUN=true: Risk micropayments are simulated.")
        self._passport = PassportCLI(config.passport_cli_bin)
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

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
        self._logger.info(
            "Risk runtime ready. Subscribing to Redis stream %r (new messages only); "
            "instructions go to %r. Blocking up to 30s waiting for Scout signals.",
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
            task_summary="ORCA Risk instruction micropayments",
            max_per_tx=2,
            max_total=100,
            ttl="24h",
            assets="USDC",
        )

    async def _handle_signal_event(self, payload: dict[str, object]) -> None:
        signal_event = ScoutSignalEvent.model_validate(payload)
        signal = signal_event.signal

        policy_ok = signal.net_delta_apy > 0
        registry_ok = True
        if self._registry is not None:
            registry_ok = await asyncio.to_thread(
                self._registry.is_active_agent_for_did_string,
                signal.scout_did,
            )
        approved = policy_ok and registry_ok
        if not registry_ok:
            reason = "Rejected: scout DID not active on ORCARegistry"
        elif not policy_ok:
            reason = "Rejected: non-positive delta"
        else:
            reason = "Auto-approved by strict risk policy"
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
        )
        await self._redis.xadd(
            self._config.risk_instruction_stream_key,
            {"payload": out_event.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )
        self._logger.info("Published risk instruction signal_id=%s instruction_id=%s", signal.signal_id, instruction_id)

    async def close(self) -> None:
        await self._x402.close()
        await self._redis.aclose()
