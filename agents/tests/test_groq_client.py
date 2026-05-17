from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

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
