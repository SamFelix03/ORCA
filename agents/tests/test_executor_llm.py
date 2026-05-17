from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from orca_common.events import RiskInstruction
from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient
from orca_executor.services.executor_llm_advisor import ExecutorLlmAdvisor


@pytest.mark.asyncio
async def test_executor_abort_path_verdict() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["Intent ambiguous; abort"],
                verdict={"execution_path": "abort", "proceed": False, "reason": "unsafe"},
                verdict_summary="Abort execution",
            ),
            "{}",
        )
    )
    advisor = ExecutorLlmAdvisor(groq)
    instruction = RiskInstruction(
        instruction_id="i1",
        signal_id="s1",
        risk_did="did:kite:orca/risk-1",
        executor_did="did:kite:orca/executor-1",
        approved=True,
        reason="ok",
        src_chain=1,
        dst_chain=2,
        src_protocol="aave-v3",
        dst_protocol="compound-v3",
        suggested_amount=1000,
        net_delta_apy=Decimal("1"),
        execution_intent=None,
        signature="0x",
        timestamp=1,
    )
    deliberation = await advisor.deliberate(instruction)
    assert deliberation.verdict["execution_path"] == "abort"
    assert deliberation.verdict["proceed"] is False
    await advisor.close()
