from __future__ import annotations

from typing import Any

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import AUDIT_SYSTEM_PROMPT

ALLOWED_DELTAS = {-20, -5, 5, 10, 20}


class AuditLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient) -> None:
        self._client = client

    async def deliberate(self, stream_name: str, payload: dict[str, Any]) -> LlmDeliberation:
        response, raw = await self._client.deliberate(
            AUDIT_SYSTEM_PROMPT,
            {"stream": stream_name, "payload": payload},
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
