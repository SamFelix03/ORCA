from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from orca_common.llm.groq_client import GroqDeliberationClient


@pytest.mark.asyncio
async def test_deliberate_parses_reasoning_steps() -> None:
    client = GroqDeliberationClient(
        api_key="test-key",
        model="test-model",
        base_url="https://api.groq.com/openai/v1",
        timeout_seconds=5.0,
    )
    payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "reasoning_steps": ["Step 1: analyze", "Step 2: decide"],
                            "verdict": {"ok": True},
                            "verdict_summary": "Approved",
                        }
                    )
                }
            }
        ]
    }
    mock_response = MagicMock()
    mock_response.json.return_value = payload
    mock_response.raise_for_status = MagicMock()
    client._client.post = AsyncMock(return_value=mock_response)  # noqa: SLF001

    result, raw = await client.deliberate("system", {"input": True})
    assert len(result.reasoning_steps) == 2
    assert result.verdict_summary == "Approved"
    assert '"ok": true' in raw.lower() or '"ok": True' in raw
    await client.close()


@pytest.mark.asyncio
async def test_deliberate_accepts_reasoning_step_objects() -> None:
    client = GroqDeliberationClient(
        api_key="test-key",
        model="test-model",
        base_url="https://api.groq.com/openai/v1",
        timeout_seconds=5.0,
    )
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "reasoning_steps": [
                                {"step": 1, "text": "Observed scout signal"},
                                "Confirmed payment fields present",
                            ],
                            "verdict": {"value_delta": 5},
                            "verdict_summary": "OK",
                        }
                    )
                }
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()
    client._client.post = AsyncMock(return_value=mock_response)  # noqa: SLF001

    result, _ = await client.deliberate("system", {})
    assert len(result.reasoning_steps) == 2
    assert "scout signal" in result.reasoning_steps[0].lower()
    await client.close()


@pytest.mark.asyncio
async def test_deliberate_missing_reasoning_raises() -> None:
    client = GroqDeliberationClient(
        api_key="test-key",
        model="test-model",
        base_url="https://api.groq.com/openai/v1",
        timeout_seconds=5.0,
    )
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [{"message": {"content": json.dumps({"verdict": {}, "verdict_summary": "x"})}}]
    }
    mock_response.raise_for_status = MagicMock()
    client._client.post = AsyncMock(return_value=mock_response)  # noqa: SLF001

    with pytest.raises(RuntimeError, match="reasoning_steps"):
        await client.deliberate("system", {})
    await client.close()


@pytest.mark.asyncio
async def test_deliberate_retries_after_rate_limit() -> None:
    client = GroqDeliberationClient(
        api_key="test-key",
        model="test-model",
        base_url="https://api.groq.com/openai/v1",
        timeout_seconds=5.0,
        max_retries=1,
        retry_base_delay_seconds=0.1,
        retry_max_delay_seconds=0.1,
    )
    rate_limited = httpx.Response(
        429,
        headers={"retry-after": "0"},
        request=httpx.Request(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
        ),
    )
    success = MagicMock()
    success.status_code = 200
    success.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "reasoning_steps": ["Waited, then retried"],
                            "verdict": {"ok": True},
                            "verdict_summary": "Approved",
                        }
                    )
                }
            }
        ]
    }
    success.raise_for_status = MagicMock()
    client._client.post = AsyncMock(side_effect=[rate_limited, success])  # noqa: SLF001

    with patch("orca_common.llm.groq_client.asyncio.sleep", new=AsyncMock()) as sleep:
        result, _ = await client.deliberate("system", {})

    assert result.verdict_summary == "Approved"
    assert client._client.post.await_count == 2  # noqa: SLF001
    sleep.assert_awaited_once_with(0.0)
    await client.close()
