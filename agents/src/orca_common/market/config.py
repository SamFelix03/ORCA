from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


class MarketDataSettingsMixin(BaseSettings):
    scout_market_data_provider: Literal["hybrid", "lucid"] = Field(default="hybrid", alias="SCOUT_MARKET_DATA_PROVIDER")
    lucid_api_base_url: str = Field(default="", alias="LUCID_API_BASE_URL")
    lucid_api_key: str = Field(default="", alias="LUCID_API_KEY")
    lucid_timeout_seconds: float = Field(default=10.0, alias="LUCID_TIMEOUT_SECONDS")
    lucid_market_path: str = Field(default="/v1/markets", alias="LUCID_MARKET_PATH")
    defillama_api_base_url: str = Field(default="https://yields.llama.fi", alias="DEFILLAMA_API_BASE_URL")
    defillama_pools_path: str = Field(default="/pools", alias="DEFILLAMA_POOLS_PATH")
    defillama_timeout_seconds: float = Field(default=10.0, alias="DEFILLAMA_TIMEOUT_SECONDS")
    defillama_min_tvl_usd: float = Field(default=100_000, alias="DEFILLAMA_MIN_TVL_USD")
    defillama_max_apy_percent: float = Field(
        default=500.0,
        ge=0,
        alias="DEFILLAMA_MAX_APY_PERCENT",
        description="Drop DefiLlama pools above this APY %% (filters bad feed rows e.g. morpho@ethereum ~3e5).",
    )
    aave_data_api_base_url: str = Field(default="", alias="AAVE_DATA_API_BASE_URL")
    aave_data_api_key: str = Field(default="", alias="AAVE_DATA_API_KEY")
    compound_data_api_base_url: str = Field(default="", alias="COMPOUND_DATA_API_BASE_URL")
    morpho_data_api_base_url: str = Field(default="", alias="MORPHO_DATA_API_BASE_URL")
    uniswap_data_api_base_url: str = Field(default="", alias="UNISWAP_DATA_API_BASE_URL")
    bridge_fee_api_base_url: str = Field(default="", alias="BRIDGE_FEE_API_BASE_URL")
    bridge_fee_api_key: str = Field(default="", alias="BRIDGE_FEE_API_KEY")
    bridge_fee_path: str = Field(default="/v1/quote", alias="BRIDGE_FEE_PATH")
    bridge_fee_timeout_seconds: float = Field(default=10.0, alias="BRIDGE_FEE_TIMEOUT_SECONDS")
    bridge_fee_response_field: str = Field(default="estimatedFeeUsdc", alias="BRIDGE_FEE_RESPONSE_FIELD")
    bridge_fee_asset_param: str = Field(default="assetSymbol", alias="BRIDGE_FEE_ASSET_PARAM")
    settlement_asset_symbol: str = Field(default="USDT", alias="SCOUT_SETTLEMENT_ASSET_SYMBOL")
