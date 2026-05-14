from __future__ import annotations

from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


class X402Client:
    def __init__(
        self,
        service_url: str,
        execute_path: str,
        api_key: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._client = httpx.AsyncClient(base_url=service_url.rstrip("/"), timeout=timeout_seconds)
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self._execute_path = execute_path

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def send_micropayment(
        self,
        to_did: str,
        amount_wei: int,
        network: str,
        asset_address: str,
        signal_id: str,
    ) -> dict[str, Any]:
        response = await self._client.post(
            self._execute_path,
            headers=self._headers,
            json={
                "toDid": to_did,
                "amountWei": str(amount_wei),
                "network": network,
                "asset": asset_address,
                "memo": f"signal:{signal_id}",
            },
        )
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        await self._client.aclose()
