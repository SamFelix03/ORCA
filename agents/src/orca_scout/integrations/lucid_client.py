from __future__ import annotations

from decimal import Decimal
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from orca_scout.models import YieldMarket


class LucidClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: float, market_path: str) -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout_seconds)
        self._headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
        self._market_path = market_path

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def fetch_markets(self) -> list[YieldMarket]:
        response = await self._client.get(self._market_path, headers=self._headers)
        response.raise_for_status()
        payload = response.json()
        return self._parse_markets(payload)

    def _parse_markets(self, payload: Any) -> list[YieldMarket]:
        items = payload.get("markets", payload if isinstance(payload, list) else [])
        markets: list[YieldMarket] = []

        for item in items:
            protocol = item.get("protocol", "").lower()
            if protocol not in {"aave-v3", "compound-v3", "morpho", "uniswap-v3"}:
                continue

            markets.append(
                YieldMarket(
                    chain_id=int(item.get("chain_id")),
                    chain_name=str(item.get("chain_name", "")),
                    protocol=protocol,  # type: ignore[arg-type]
                    apy=Decimal(str(item.get("apy"))),
                    tvl_usdc=Decimal(str(item.get("tvl_usdc", "0"))),
                    utilization=Decimal(str(item.get("utilization", "0"))),
                    timestamp=int(item.get("timestamp")),
                )
            )

        return markets

    async def close(self) -> None:
        await self._client.aclose()
