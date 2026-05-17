from __future__ import annotations

from typing import Any

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import AUDIT_SYSTEM_PROMPT

ALLOWED_DELTAS = {-20, -5, 5, 10, 20}


def _compact_audit_payload(stream_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Shrink Redis payloads so Groq returns complete JSON with reasoning_steps."""
    event = payload.get("event")
    compact: dict[str, Any] = {"event": event, "stream": stream_name}
    if event == "scout.signal.created":
        signal = payload.get("signal") or {}
        compact["signal"] = {
            "signal_id": signal.get("signal_id"),
            "src_chain": signal.get("src_chain"),
            "dst_chain": signal.get("dst_chain"),
            "src_protocol": signal.get("src_protocol"),
            "dst_protocol": signal.get("dst_protocol"),
            "net_delta_apy": signal.get("net_delta_apy"),
            "suggested_amount": signal.get("suggested_amount"),
            "has_execution_intent": signal.get("execution_intent") is not None,
        }
        compact["paymentTxHash"] = payload.get("paymentTxHash")
        prior = payload.get("llm_deliberation")
        if isinstance(prior, dict):
            compact["prior_llm_verdict_summary"] = prior.get("verdict_summary")
    elif event == "risk.instruction.created":
        instruction = payload.get("instruction") or {}
        compact["instruction"] = {
            "instruction_id": instruction.get("instruction_id"),
            "signal_id": instruction.get("signal_id"),
            "approved": instruction.get("approved"),
            "reason": instruction.get("reason"),
            "net_delta_apy": instruction.get("net_delta_apy"),
            "has_execution_intent": instruction.get("execution_intent") is not None,
        }
        compact["paymentTxHash"] = payload.get("paymentTxHash")
    elif event == "execution.settled":
        compact["execution"] = {
            "signal_id": payload.get("signal_id"),
            "instruction_id": payload.get("instruction_id"),
            "success": payload.get("success"),
            "status": payload.get("status"),
            "tx_hash": payload.get("tx_hash"),
        }
        compact["paymentTxHash"] = payload.get("paymentTxHash")
    else:
        compact["payload_keys"] = list(payload.keys())[:20]
    return compact


class AuditLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient) -> None:
        self._client = client

    async def deliberate(self, stream_name: str, payload: dict[str, Any]) -> LlmDeliberation:
        response, raw = await self._client.deliberate(
            AUDIT_SYSTEM_PROMPT,
            {"stream": stream_name, "payload": _compact_audit_payload(stream_name, payload)},
        )
        delta = response.verdict.get("value_delta")
        if isinstance(delta, (int, float)):
            clamped = min(ALLOWED_DELTAS, key=lambda x: abs(x - int(delta)))
            response.verdict["value_delta"] = clamped
        else:
            response.verdict["value_delta"] = 5
        return LlmDeliberation.from_response(
            agent_type="audit",
            model=self._client.model,
            response=response,
            raw_content=raw,
        )

    async def close(self) -> None:
        await self._client.close()
