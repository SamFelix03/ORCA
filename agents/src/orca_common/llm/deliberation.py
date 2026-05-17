from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


AgentTypeLiteral = Literal["scout", "risk", "executor", "audit"]


class LlmDeliberationResponse(BaseModel):
    reasoning_steps: list[str] = Field(..., min_length=1)
    verdict: dict[str, Any]
    verdict_summary: str = Field(..., min_length=1)


class LlmDeliberation(BaseModel):
    agent_type: AgentTypeLiteral
    model: str
    chain_of_thought: list[str]
    verdict: dict[str, Any]
    verdict_summary: str
    raw_content: str | None = None

    @classmethod
    def from_response(
        cls,
        *,
        agent_type: AgentTypeLiteral,
        model: str,
        response: LlmDeliberationResponse,
        raw_content: str | None = None,
    ) -> "LlmDeliberation":
        return cls(
            agent_type=agent_type,
            model=model,
            chain_of_thought=response.reasoning_steps,
            verdict=response.verdict,
            verdict_summary=response.verdict_summary,
            raw_content=raw_content,
        )
