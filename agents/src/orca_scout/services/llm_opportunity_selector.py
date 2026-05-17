from __future__ import annotations

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import SCOUT_SYSTEM_PROMPT
from orca_scout.models import RankedOpportunity


class LLMOpportunitySelector:
    def __init__(
        self,
        client: GroqDeliberationClient,
        max_candidates: int,
    ) -> None:
        self._client = client
        self._max_candidates = max_candidates

    async def select_best(self, ranked: list[RankedOpportunity]) -> tuple[RankedOpportunity, LlmDeliberation]:
        if not ranked:
            raise RuntimeError("LLM selector requires at least one ranked opportunity")
        top = ranked[: self._max_candidates]
        prompt_payload = {
            "candidates": [
                {
                    "index": idx,
                    "src_chain": item.src_chain,
                    "dst_chain": item.dst_chain,
                    "src_protocol": item.src_protocol,
                    "dst_protocol": item.dst_protocol,
                    "current_apy": str(item.current_apy),
                    "target_apy": str(item.target_apy),
                    "net_delta_apy": str(item.net_delta_apy),
                    "annualized_bridge_cost_apy": str(item.annualized_bridge_cost_apy),
                    "suggested_amount": item.suggested_amount,
                }
                for idx, item in enumerate(top)
            ]
        }
        response, raw = await self._client.deliberate(SCOUT_SYSTEM_PROMPT, prompt_payload)
        idx = response.verdict.get("selected_index")
        if not isinstance(idx, int) or idx < 0 or idx >= len(top):
            raise RuntimeError(f"LLM selector returned invalid selected_index: {idx!r}")
        deliberation = LlmDeliberation.from_response(
            agent_type="scout",
            model=self._client.model,
            response=response,
            raw_content=raw,
        )
        return top[idx], deliberation

    async def close(self) -> None:
        await self._client.close()
