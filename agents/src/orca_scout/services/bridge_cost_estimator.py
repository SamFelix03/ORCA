from __future__ import annotations

from decimal import Decimal

from orca_scout.integrations.bridge_fee_client import BridgeFeeClient


class BridgeCostEstimator:
    def __init__(self, fee_client: BridgeFeeClient, asset_symbol: str = "USDT") -> None:
        self._fee_client = fee_client
        self._asset_symbol = asset_symbol

    async def estimate_annualized_cost_apy(self, src_chain: int, dst_chain: int, amount_usdc: int) -> Decimal:
        fee_usdc = await self._fee_client.estimate_fee_asset(src_chain, dst_chain, amount_usdc, self._asset_symbol)
        if amount_usdc <= 0:
            return Decimal("0")
        # Normalize one-time bridge fee against principal.
        return (fee_usdc / Decimal(amount_usdc)) * Decimal("100")
