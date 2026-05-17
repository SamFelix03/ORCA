from __future__ import annotations

from decimal import Decimal

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


class BridgeFeeClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        fee_path: str,
        timeout_seconds: float,
        response_field: str = "estimatedFeeUsdc",
        asset_param: str = "assetSymbol",
    ) -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout_seconds)
        self._headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
        self._fee_path = fee_path
        self._response_field = response_field
        self._asset_param = asset_param

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def estimate_fee_asset(self, src_chain: int, dst_chain: int, amount: int, asset_symbol: str) -> Decimal:
        response = await self._client.get(
            self._fee_path,
            headers=self._headers,
            params={
                "srcChainId": src_chain,
                "dstChainId": dst_chain,
                "amount": amount,
                self._asset_param: asset_symbol,
            },
        )
        response.raise_for_status()
        payload = response.json()
        return Decimal(str(payload.get(self._response_field, "0")))

    async def close(self) -> None:
        await self._client.aclose()
