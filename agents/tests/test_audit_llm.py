from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from orca_audit.services.audit_llm_advisor import AuditLlmAdvisor, ALLOWED_DELTAS
from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient


@pytest.mark.asyncio
async def test_audit_clamps_value_delta() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["score"],
                verdict={"value_delta": 7, "attribution_summary": "ok", "anomalies": []},
                verdict_summary="Scored",
            ),
            "{}",
        )
    )
    advisor = AuditLlmAdvisor(groq)
    deliberation = await advisor.deliberate("orca:signals:scout", {"event": "scout.signal.created"})
    delta = deliberation.verdict["value_delta"]
    assert delta in ALLOWED_DELTAS
    await advisor.close()
