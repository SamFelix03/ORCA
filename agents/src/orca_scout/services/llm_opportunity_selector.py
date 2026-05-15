from __future__ import annotations

import json
import logging
from decimal import Decimal

import httpx

from orca_scout.models import RankedOpportunity


class LLMOpportunitySelector:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float,
        max_candidates: int,
    ) -> None:
        self._logger = logging.getLogger("orca_scout.llm_selector")
        self._model = model
        self._max_candidates = max_candidates
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def select_best(self, ranked: list[RankedOpportunity]) -> RankedOpportunity | None:
        if not ranked:
            return None
        top = ranked[: self._max_candidates]
        prompt_payload = [
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
        body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are ORCA Scout's risk-aware ranking assistant. "
                        "Pick exactly one candidate index from provided opportunities. "
                        "Prefer high net_delta_apy and lower bridge_cost_apy. "
                        "Return strict JSON: {\"selected_index\": <int>, \"reason\": <short string>}."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({"candidates": prompt_payload}),
                },
            ],
        }
        response = await self._client.post("/chat/completions", json=body)
        response.raise_for_status()
        payload = response.json()
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        parsed = json.loads(content)
        idx = parsed.get("selected_index")
        if not isinstance(idx, int) or idx < 0 or idx >= len(top):
            self._logger.warning("LLM selector returned invalid index: %s", idx)
            return None
        return top[idx]

    async def close(self) -> None:
        await self._client.aclose()


def pick_with_fallback(ranked: list[RankedOpportunity], selected: RankedOpportunity | None) -> RankedOpportunity | None:
    if selected is None:
        raise RuntimeError("LLM selector returned no valid candidate in strict mode")
    return selected
