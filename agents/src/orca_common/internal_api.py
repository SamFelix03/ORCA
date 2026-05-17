from __future__ import annotations

from typing import Any

import httpx

from orca_common.llm.deliberation import LlmDeliberation


async def post_agent_deliberation(
    *,
    base_url: str,
    api_key: str,
    signal_id: str | None,
    agent_type: str,
    agent_did: str | None,
    step: str,
    deliberation: LlmDeliberation,
    client: httpx.AsyncClient | None = None,
) -> None:
    base = base_url.strip().rstrip("/")
    if not base:
        return
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key.strip():
        headers["x-orca-internal-key"] = api_key.strip()
    body = {
        "signalId": signal_id,
        "agentType": agent_type,
        "agentDid": agent_did,
        "step": step,
        "llmDeliberation": deliberation.model_dump(),
    }
    owned = client is None
    http = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await http.post(f"{base}/internal/agent-deliberation", json=body, headers=headers)
        response.raise_for_status()
    finally:
        if owned:
            await http.aclose()
