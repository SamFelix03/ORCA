from __future__ import annotations

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import RISK_SYSTEM_PROMPT
from orca_common.llm.risk_verdict import validate_risk_deliberation
from orca_risk.services.risk_context_builder import RiskEvidencePack


class RiskLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient) -> None:
        self._client = client

    async def deliberate(self, evidence: RiskEvidencePack) -> LlmDeliberation:
        payload = evidence.model_dump()
        response, raw = await self._client.deliberate(
            RISK_SYSTEM_PROMPT,
            {
                "evidence": payload,
                "output_contract": (
                    "Return strict JSON only per system prompt. "
                    "reasoning_steps must be 4+ strings; verdict must include "
                    "recommended_approved (bool), confidence (0-1), reason, evidence_citations."
                ),
            },
        )
        response = validate_risk_deliberation(response)
        verdict = dict(response.verdict)
        verdict["evidence"] = payload
        response.verdict = verdict
        return LlmDeliberation.from_response(
            agent_type="risk",
            model=self._client.model,
            response=response,
            raw_content=raw,
        )

    async def close(self) -> None:
        await self._client.close()
