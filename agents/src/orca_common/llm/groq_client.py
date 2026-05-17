from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from orca_common.llm.deliberation import LlmDeliberationResponse


class GroqDeliberationClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float,
    ) -> None:
        if not api_key.strip():
            raise ValueError("GROQ_API_KEY is required")
        self._model = model
        self._logger = logging.getLogger("orca_common.llm.groq")
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def deliberate(self, system_prompt: str, user_payload: dict[str, Any]) -> tuple[LlmDeliberationResponse, str]:
        body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
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
        steps = parsed.get("reasoning_steps")
        if not isinstance(steps, list) or not steps or not all(isinstance(s, str) for s in steps):
            raise RuntimeError("LLM response missing valid reasoning_steps array")
        verdict = parsed.get("verdict")
        if not isinstance(verdict, dict):
            raise RuntimeError("LLM response missing verdict object")
        summary = parsed.get("verdict_summary")
        if not isinstance(summary, str) or not summary.strip():
            raise RuntimeError("LLM response missing verdict_summary string")
        result = LlmDeliberationResponse(
            reasoning_steps=steps,
            verdict=verdict,
            verdict_summary=summary.strip(),
        )
        for idx, step in enumerate(result.reasoning_steps, start=1):
            self._logger.info("LLM reasoning step %d: %s", idx, step)
        self._logger.info("LLM verdict_summary: %s", result.verdict_summary)
        return result, content

    @property
    def model(self) -> str:
        return self._model

    async def close(self) -> None:
        await self._client.aclose()
