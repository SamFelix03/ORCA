from __future__ import annotations

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import RISK_SYSTEM_PROMPT
from orca_risk.services.risk_context_builder import RiskEvidencePack


class RiskLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient) -> None:
        self._client = client

    async def deliberate(self, evidence: RiskEvidencePack) -> LlmDeliberation:
        payload = evidence.model_dump()
        response, raw = await self._client.deliberate(RISK_SYSTEM_PROMPT, {"evidence": payload})
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
