from __future__ import annotations

from decimal import Decimal

from orca_common.market.defillama_client import DefiLlamaClient
from orca_common.models.market import YieldMarket
from orca_scout.services.bridge_cost_estimator import BridgeCostEstimator
from orca_scout.services.opportunity_ranker import OpportunityRanker


def test_defillama_normalizes_percent_to_decimal() -> None:
    client = DefiLlamaClient("https://example.com", "/pools", 5.0, max_apy_percent=500.0)
    apy, ok = client._normalize_apy_percent(Decimal("8.5"))
    assert ok is True
    assert apy == Decimal("0.085")


def test_defillama_rejects_insane_apy() -> None:
    client = DefiLlamaClient("https://example.com", "/pools", 5.0, max_apy_percent=500.0)
    _, ok = client._normalize_apy_percent(Decimal("297995.79868"))
    assert ok is False


def test_rank_feed_returns_multiple_protocols() -> None:
    ranker = OpportunityRanker(BridgeCostEstimator(None, "USDT"), allowed_routes={(2368, 11155111)})
    markets = [
        YieldMarket(
            chain_id=1,
            chain_name="ethereum",
            protocol="morpho",
            apy=Decimal("0.12"),
            tvl_usdc=Decimal("1_000_000"),
            utilization=Decimal("0.5"),
            timestamp=1,
        ),
        YieldMarket(
            chain_id=1,
            chain_name="ethereum",
            protocol="compound-v3",
            apy=Decimal("0.10"),
            tvl_usdc=Decimal("2_000_000"),
            utilization=Decimal("0.4"),
            timestamp=1,
        ),
        YieldMarket(
            chain_id=1,
            chain_name="ethereum",
            protocol="aave-v3",
            apy=Decimal("0.08"),
            tvl_usdc=Decimal("3_000_000"),
            utilization=Decimal("0.3"),
            timestamp=1,
        ),
    ]
    manifest = {(11155111, "morpho"), (11155111, "compound-v3"), (11155111, "aave-v3")}
    remap = {1: 11155111}
    ranked = ranker.rank_feed_to_stub_deposit(
        markets,
        manifest,
        remap,
        suggested_amount_usdc=10_000,
        max_suggested_amount_usdc=50_000,
        kite_chain_id=2368,
        kite_anchor_protocol="aave-v3",
        max_candidates=3,
    )
    assert len(ranked) == 3
    assert ranked[0].dst_protocol == "morpho"
    assert ranked[1].dst_protocol == "compound-v3"
    assert all(item.src_protocol == "aave-v3" and item.src_chain == 2368 for item in ranked)
