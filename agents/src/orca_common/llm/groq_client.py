from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import logging
import random
from typing import Any

import httpx

from orca_common.llm.deliberation import LlmDeliberationResponse

_REASONING_STEP_ALIASES = ("reasoning_steps", "chain_of_thought", "reasoning", "steps", "audit_trail")


def _coerce_reasoning_step_item(item: object) -> str | None:
    if isinstance(item, str):
        text = item.strip()
        return text or None
    if isinstance(item, (int, float, bool)):
        return str(item)
    if isinstance(item, dict):
        for key in ("text", "content", "step", "reasoning", "summary", "detail"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        flattened = json.dumps(item, ensure_ascii=False).strip()
        return flattened or None
    if item is None:
        return None
    text = str(item).strip()
    return text or None


def normalize_reasoning_steps(parsed: dict[str, Any]) -> list[str]:
    """Accept strict string arrays and common Groq JSON variants."""
    raw: object | None = None
    for key in _REASONING_STEP_ALIASES:
        candidate = parsed.get(key)
        if candidate is not None:
            raw = candidate
            break

    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]

    if isinstance(raw, dict):
        raw = list(raw.values())

    if not isinstance(raw, list):
        return []

    steps: list[str] = []
    for item in raw:
        text = _coerce_reasoning_step_item(item)
        if text:
            steps.append(text)
    return steps


class GroqDeliberationClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float,
        request_delay_seconds: float = 0.0,
        request_jitter_seconds: float = 0.0,
        max_retries: int = 0,
        retry_base_delay_seconds: float = 2.0,
        retry_max_delay_seconds: float = 30.0,
    ) -> None:
        if not api_key.strip():
            raise ValueError("GROQ_API_KEY is required")
        self._model = model
        self._logger = logging.getLogger("orca_common.llm.groq")
        self._request_delay_seconds = max(request_delay_seconds, 0.0)
        self._request_jitter_seconds = max(request_jitter_seconds, 0.0)
        self._max_retries = max(max_retries, 0)
        self._retry_base_delay_seconds = max(retry_base_delay_seconds, 0.1)
        self._retry_max_delay_seconds = max(
            retry_max_delay_seconds,
            self._retry_base_delay_seconds,
        )
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    async def deliberate(
        self,
        system_prompt: str,
        user_payload: dict[str, Any],
    ) -> tuple[LlmDeliberationResponse, str]:
        body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
        }
        await self._sleep_before_request()
        response = await self._post_with_rate_limit_retries(body)
        payload = response.json()
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise RuntimeError("LLM response must be a JSON object")
        steps = normalize_reasoning_steps(parsed)
        if not steps:
            preview = content[:500] if isinstance(content, str) else str(content)[:500]
            self._logger.error("LLM JSON missing reasoning_steps (preview): %s", preview)
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

    async def _sleep_before_request(self) -> None:
        delay = self._request_delay_seconds
        if self._request_jitter_seconds:
            delay += random.uniform(0.0, self._request_jitter_seconds)
        if delay > 0:
            self._logger.debug("Pacing Groq request for %.2fs", delay)
            await asyncio.sleep(delay)

    async def _post_with_rate_limit_retries(self, body: dict[str, Any]) -> httpx.Response:
        last_response: httpx.Response | None = None
        for attempt in range(self._max_retries + 1):
            response = await self._client.post("/chat/completions", json=body)
            if response.status_code != 429:
                response.raise_for_status()
                return response

            last_response = response
            if attempt >= self._max_retries:
                response.raise_for_status()

            delay = self._retry_delay_seconds(response, attempt)
            self._logger.warning(
                "Groq rate limit hit; retrying in %.2fs (attempt %d/%d)",
                delay,
                attempt + 1,
                self._max_retries,
            )
            await asyncio.sleep(delay)

        if last_response is None:
            raise RuntimeError("Groq request failed without a response")
        last_response.raise_for_status()
        return last_response

    def _retry_delay_seconds(self, response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("retry-after")
        if retry_after:
            parsed = self._parse_retry_after(retry_after)
            if parsed is not None:
                return min(parsed, self._retry_max_delay_seconds)

        delay = self._retry_base_delay_seconds * (2**attempt)
        delay += random.uniform(0.0, min(1.0, self._retry_base_delay_seconds))
        return min(delay, self._retry_max_delay_seconds)

    @staticmethod
    def _parse_retry_after(value: str) -> float | None:
        try:
            return max(float(value), 0.0)
        except ValueError:
            pass

        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max((retry_at - datetime.now(timezone.utc)).total_seconds(), 0.0)

    @property
    def model(self) -> str:
        return self._model

    async def close(self) -> None:
        await self._client.aclose()
