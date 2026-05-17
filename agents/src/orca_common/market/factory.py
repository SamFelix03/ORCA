from __future__ import annotations

from typing import Any

from orca_common.market import (
    AaveUtilizationEnricher,
    BridgeCostEstimator,
    BridgeFeeClient,
    CompoundUtilizationEnricher,
    DefiLlamaClient,
    GoldskyClient,
    LucidClient,
    MorphoUtilizationEnricher,
    UniswapUtilizationEnricher,
)
from orca_common.market.config import MarketDataSettingsMixin


def build_market_stack(config: MarketDataSettingsMixin) -> tuple[Any, list[Any], GoldskyClient | None, BridgeCostEstimator]:
    if config.scout_market_data_provider == "hybrid":
        feed = DefiLlamaClient(
            config.defillama_api_base_url,
            config.defillama_pools_path,
            config.defillama_timeout_seconds,
            config.defillama_min_tvl_usd,
        )
        enrichers = [
            AaveUtilizationEnricher(
                config.aave_data_api_base_url,
                config.aave_data_api_key,
                config.defillama_timeout_seconds,
            ),
            CompoundUtilizationEnricher(
                config.compound_data_api_base_url,
                config.defillama_timeout_seconds,
            ),
            MorphoUtilizationEnricher(
                config.morpho_data_api_base_url,
                config.defillama_timeout_seconds,
            ),
            UniswapUtilizationEnricher(
                config.uniswap_data_api_base_url,
                config.defillama_timeout_seconds,
            ),
        ]
    else:
        feed = LucidClient(
            config.lucid_api_base_url,
            config.lucid_api_key,
            config.lucid_timeout_seconds,
            config.lucid_market_path,
        )
        enrichers = []

    goldsky: GoldskyClient | None = None
    if config.goldsky_api_base_url.strip() and config.goldsky_subgraph_id.strip():
        goldsky = GoldskyClient(
            config.goldsky_api_base_url,
            config.goldsky_api_key,
            config.goldsky_timeout_seconds,
            config.goldsky_query_path,
            config.goldsky_subgraph_id,
        )

    bridge_fee: BridgeFeeClient | None = None
    if config.bridge_fee_api_base_url.strip() and config.bridge_fee_api_key.strip():
        bridge_fee = BridgeFeeClient(
            config.bridge_fee_api_base_url,
            config.bridge_fee_api_key,
            config.bridge_fee_path,
            config.bridge_fee_timeout_seconds,
            config.bridge_fee_response_field,
            config.bridge_fee_asset_param,
        )
    estimator = BridgeCostEstimator(bridge_fee, config.settlement_asset_symbol)
    return feed, enrichers, goldsky, estimator
