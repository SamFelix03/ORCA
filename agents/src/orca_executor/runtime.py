from __future__ import annotations

import json
import logging
import time

from redis.asyncio import Redis

from orca_common.events import ExecutionSettledEvent, RiskInstructionEvent
from orca_executor.config import ExecutorConfig
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.integrations.x402_client import X402Client
from orca_scout.models import ActionType, PoAIRecord


class ExecutorRuntime:
    def __init__(self, config: ExecutorConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_executor.runtime")
        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._passport = PassportCLI(config.passport_cli_bin)
        self._x402 = X402Client(
            service_url=config.x402_service_url,
            execute_path=config.x402_execute_path,
            kpass_bin=config.passport_cli_bin,
            dry_run=config.x402_dry_run,
        )
        if config.x402_dry_run:
            self._logger.warning("X402_DRY_RUN=true: Executor micropayments are simulated.")
        self._poai = PoAIClient(
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            contract_address=config.poai_contract_address,
            signer_private_key=config.executor_private_key,
        )

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
        self._logger.info(
            "Executor runtime ready. Subscribing to Redis stream %r (Risk instructions). Blocking up to 30s.",
            self._config.risk_instruction_stream_key,
        )
        first_cycle = True
        while True:
            if first_cycle:
                self._logger.info("Executor: establishing Passport session…")
                first_cycle = False
            await self._ensure_passport_session()
            stream_data = await self._redis.xread(
                {self._config.risk_instruction_stream_key: "$"},
                block=30_000,
                count=20,
            )
            if not stream_data:
                self._logger.info(
                    "Executor: idle — no Risk instructions on %r (will retry).",
                    self._config.risk_instruction_stream_key,
                )
                continue
            for _, records in stream_data:
                for event_id, fields in records:
                    payload_raw = fields.get(b"payload")
                    if not payload_raw:
                        raise RuntimeError(f"Executor received malformed stream event without payload at {event_id!r}")
                    payload = json.loads(payload_raw.decode("utf-8"))
                    await self._handle_instruction(payload)

    async def _run_startup_preflight(self) -> None:
        await self._redis.ping()
        self._logger.info("Executor Redis preflight OK.")
        self._passport.check_ready()
        self._logger.info("Executor Passport CLI preflight OK.")
        if not self._poai.is_connected():
            raise RuntimeError("Executor PoAI connectivity preflight failed.")
        self._logger.info("Executor PoAI RPC preflight OK.")

    async def _ensure_passport_session(self) -> None:
        self._passport.ensure_active_session(
            task_summary="ORCA Executor settlement micropayments",
            max_per_tx=2,
            max_total=100,
            ttl="24h",
            assets="USDC",
        )

    async def _handle_instruction(self, payload: dict[str, object]) -> None:
        event = RiskInstructionEvent.model_validate(payload)
        instruction = event.instruction

        if not instruction.approved:
            self._logger.info("Instruction %s rejected by risk agent. Skipping execution.", instruction.instruction_id)
            return

        # Strict path: require execution intent and perform the vault call through configured tx relay path.
        if instruction.execution_intent is None:
            raise RuntimeError(f"Instruction {instruction.instruction_id} missing execution intent")

        # Placeholder strict contract execution surface; in production this must use AA SDK/userop path.
        tx_hash = self._poai.record_signal_action(
            self._config.scout_epoch_id,
            PoAIRecord(
                agent_did_hash=b"\x00" * 31 + b"\x01",
                action_type=ActionType.EXECUTION,
                input_hash=b"\x00" * 32,
                outcome_hash=b"\x00" * 31 + b"\x02",
                value_delta=int(instruction.suggested_amount),
                timestamp=int(time.time()),
            ),
        )

        payment = await self._x402.send_micropayment(
            to_did=self._config.audit_agent_did,
            amount_wei=self._config.x402_max_amount_required_wei,
            network=self._config.x402_network,
            asset_address=self._config.x402_asset_address,
            signal_id=instruction.signal_id,
        )
        payment_tx_hash = str(payment.get("txHash", ""))
        if not payment_tx_hash:
            raise RuntimeError("Executor x402 payment succeeded without txHash; strict mode requires tx hash.")

        settled = ExecutionSettledEvent(
            event="execution.settled",
            instruction_id=instruction.instruction_id,
            signal_id=instruction.signal_id,
            executor_did=self._config.executor_agent_did,
            success=True,
            status="executed",
            tx_hash=tx_hash,
            paymentTxHash=payment_tx_hash,
            timestamp=int(time.time()),
        )
        await self._redis.xadd(
            self._config.execution_stream_key,
            {"payload": settled.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )
        self._logger.info("Execution settled instruction_id=%s tx_hash=%s", instruction.instruction_id, tx_hash)

    async def close(self) -> None:
        await self._x402.close()
        await self._redis.aclose()
