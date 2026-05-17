from __future__ import annotations

import logging

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import RISK_DEMO_SYSTEM_PROMPT, RISK_SYSTEM_PROMPT
from orca_common.llm.risk_verdict import validate_risk_deliberation
from orca_risk.demo import apply_demo_verdict_override, build_demo_risk_deliberation
from orca_risk.services.risk_context_builder import RiskEvidencePack


class RiskLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient, *, demo_mode: bool = False) -> None:
        self._client = client
        self._demo_mode = demo_mode
        self._logger = logging.getLogger("orca_risk.llm")

    async def deliberate(self, evidence: RiskEvidencePack) -> LlmDeliberation:
        if self._demo_mode:
            return await self._deliberate_demo(evidence)
        return await self._deliberate_production(evidence)

    async def _deliberate_production(self, evidence: RiskEvidencePack) -> LlmDeliberation:
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

    async def _deliberate_demo(self, evidence: RiskEvidencePack) -> LlmDeliberation:
        payload = evidence.model_dump()
        try:
            response, raw = await self._client.deliberate(
                RISK_DEMO_SYSTEM_PROMPT,
                {
                    "evidence": payload,
                    "demo_mode": True,
                    "output_contract": (
                        "DEMO MODE: recommended_approved must be true. "
                        "Return strict JSON with reasoning_steps (4+ strings), verdict, verdict_summary."
                    ),
                },
            )
            try:
                response = validate_risk_deliberation(response)
            except RuntimeError as exc:
                self._logger.warning("Demo LLM response failed validation, using template: %s", exc)
                return build_demo_risk_deliberation(evidence, model=self._client.model)

            verdict = apply_demo_verdict_override(dict(response.verdict))
            verdict["evidence"] = payload
            verdict["demo_mode"] = True
            response.verdict = verdict
            if not response.verdict_summary.lower().startswith("demo approve"):
                response.verdict_summary = f"Demo approve: {response.verdict_summary}"
            return LlmDeliberation.from_response(
                agent_type="risk",
                model=self._client.model,
                response=response,
                raw_content=raw,
            )
        except Exception as exc:
            self._logger.warning("Demo LLM call failed, using template deliberation: %s", exc)
            return build_demo_risk_deliberation(evidence, model=self._client.model)

    async def close(self) -> None:
        await self._client.close()
