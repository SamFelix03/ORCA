from __future__ import annotations

import json
import logging
import time
from hashlib import sha256

from redis.asyncio import Redis

from orca_audit.config import AuditConfig
from orca_common.events import ExecutionSettledEvent, RiskInstructionEvent, ScoutSignalEvent
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

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
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
        if not self._poai.is_connected():
            raise RuntimeError("Audit PoAI connectivity preflight failed.")

    async def _record_event(self, stream_name: str, payload: dict[str, object]) -> None:
        action_type = ActionType.AUDIT
        value_delta = 1
        if stream_name == self._config.scout_signal_stream_key:
            ScoutSignalEvent.model_validate(payload)
            action_type = ActionType.SIGNAL
            value_delta = 10
        elif stream_name == self._config.risk_instruction_stream_key:
            RiskInstructionEvent.model_validate(payload)
            action_type = ActionType.RISK_EVAL
            value_delta = 5
        elif stream_name == self._config.execution_stream_key:
            event = ExecutionSettledEvent.model_validate(payload)
            action_type = ActionType.EXECUTION
            value_delta = 20 if event.success else -20
        else:
            raise RuntimeError(f"Audit received unknown stream: {stream_name}")

        payload_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        digest = sha256(payload_bytes).digest()
        did_hash = sha256(self._config.audit_did.encode("utf-8")).digest()
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
        self._logger.info("Audit recorded PoAI action=%s stream=%s tx=%s", action_type.value, stream_name, tx_hash)

    async def close(self) -> None:
        await self._redis.aclose()
