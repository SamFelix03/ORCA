from __future__ import annotations

import json
import logging
import time
from hashlib import sha256
from typing import Any

import httpx
from redis.asyncio import Redis
from web3 import Web3

from orca_audit.config import AuditConfig
from orca_audit.services.audit_llm_advisor import AuditLlmAdvisor
from orca_common.events import ExecutionSettledEvent, RiskInstructionEvent, ScoutSignalEvent
from orca_common.internal_api import post_agent_deliberation
from orca_common.llm import GroqDeliberationClient
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.models import ActionType, PoAIRecord


class AuditRuntime:
    def __init__(self, config: AuditConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_audit.runtime")
        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._poai = PoAIClient(
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            contract_address=config.poai_contract_address,
            signer_private_key=config.audit_private_key,
        )
        groq = GroqDeliberationClient(
            api_key=config.groq_api_key,
            model=config.groq_model,
            base_url=config.groq_base_url,
            timeout_seconds=config.groq_timeout_seconds,
        )
        self._llm_advisor = AuditLlmAdvisor(groq)
        self._http = httpx.AsyncClient(timeout=15.0)

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
        self._logger.info(
            "Audit runtime ready. Listening on streams scout=%r risk=%r execution=%r (30s block).",
            self._config.scout_signal_stream_key,
            self._config.risk_instruction_stream_key,
            self._config.execution_stream_key,
        )
        while True:
            stream_data = await self._redis.xread(
                {
                    self._config.scout_signal_stream_key: "$",
                    self._config.risk_instruction_stream_key: "$",
                    self._config.execution_stream_key: "$",
                },
                block=30_000,
                count=20,
            )
            if not stream_data:
                self._logger.info(
                    "Audit: idle — no stream activity on scout/risk/execution (will retry).",
                )
                continue
            for stream_key, records in stream_data:
                stream_name = stream_key.decode("utf-8")
                for event_id, fields in records:
                    payload_raw = fields.get(b"payload")
                    if not payload_raw:
                        raise RuntimeError(f"Audit received malformed stream event without payload at {event_id!r}")
                    payload = json.loads(payload_raw.decode("utf-8"))
                    await self._record_event(stream_name, payload)

    async def _run_startup_preflight(self) -> None:
        await self._redis.ping()
        self._logger.info("Audit Redis preflight OK.")
        if not self._poai.is_connected():
            raise RuntimeError("Audit PoAI connectivity preflight failed.")
        self._logger.info("Audit PoAI RPC preflight OK.")

    async def _record_event(self, stream_name: str, payload: dict[str, Any]) -> None:
        action_type = ActionType.AUDIT
        if stream_name == self._config.scout_signal_stream_key:
            event = ScoutSignalEvent.model_validate(payload)
            action_type = ActionType.SIGNAL
            signal_id = event.signal.signal_id
        elif stream_name == self._config.risk_instruction_stream_key:
            event = RiskInstructionEvent.model_validate(payload)
            action_type = ActionType.RISK_EVAL
            signal_id = event.instruction.signal_id
        elif stream_name == self._config.execution_stream_key:
            event = ExecutionSettledEvent.model_validate(payload)
            action_type = ActionType.EXECUTION
            signal_id = event.signal_id
        else:
            raise RuntimeError(f"Audit received unknown stream: {stream_name}")

        deliberation = await self._llm_advisor.deliberate(stream_name, payload)
        value_delta = int(deliberation.verdict.get("value_delta", 5))

        payload_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        digest = sha256(payload_bytes).digest()
        did_hash = Web3.keccak(text=self._config.audit_did.strip())
        tx_hash = self._poai.record_signal_action(
            self._config.scout_epoch_id,
            PoAIRecord(
                agent_did_hash=did_hash,
                action_type=action_type,
                input_hash=digest,
                outcome_hash=digest,
                value_delta=value_delta,
                timestamp=int(time.time()),
            ),
        )
        step = {
            ActionType.SIGNAL: "audit.signal",
            ActionType.RISK_EVAL: "audit.risk",
            ActionType.EXECUTION: "audit.execution",
        }.get(action_type, "audit.attribution")
        await post_agent_deliberation(
            base_url=self._config.orca_api_base_url,
            api_key=self._config.orca_internal_api_key,
            signal_id=signal_id,
            agent_type="audit",
            agent_did=self._config.audit_did,
            step=step,
            deliberation=deliberation,
            client=self._http,
        )
        self._logger.info(
            "Audit recorded PoAI action=%s stream=%s tx=%s value_delta=%s summary=%s",
            action_type.value,
            stream_name,
            tx_hash,
            value_delta,
            deliberation.verdict_summary,
        )

    async def close(self) -> None:
        await self._llm_advisor.close()
        await self._http.aclose()
        await self._redis.aclose()
