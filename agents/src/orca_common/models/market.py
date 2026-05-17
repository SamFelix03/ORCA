from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

ProtocolName = Literal["aave-v3", "compound-v3", "morpho", "uniswap-v3"]


class YieldMarket(BaseModel):
    chain_id: int
    chain_name: str
    protocol: ProtocolName
    apy: Decimal = Field(..., ge=Decimal("0"))
    tvl_usdc: Decimal = Field(..., ge=Decimal("0"))
    utilization: Decimal = Field(..., ge=Decimal("0"), le=Decimal("1"))
    timestamp: int
