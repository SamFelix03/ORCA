from __future__ import annotations

from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import logging


class GoldskyClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_seconds: float,
        query_path: str,
        subgraph_id: str,
    ) -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout_seconds)
        self._logger = logging.getLogger("orca_scout.provider.goldsky")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self._query_path = query_path
        self._subgraph_id = subgraph_id

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def fetch_recent_protocol_events(self) -> dict[str, Any]:
        query = """
        query RecentEvents($subgraphId: String!) {
          subgraph(id: $subgraphId) {
            id
          }
        }
        """
        response = await self._client.post(
            self._query_path,
            headers=self._headers,
            json={"query": query, "variables": {"subgraphId": self._subgraph_id}},
        )
        response.raise_for_status()
        body = response.json()
        data = body.get("data", {})
        self._logger.info("Goldsky recent_events_keys=%s", ",".join(sorted(data.keys())) if isinstance(data, dict) else "none")
        return data

    async def close(self) -> None:
        await self._client.aclose()
