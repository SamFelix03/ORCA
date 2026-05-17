from __future__ import annotations

from decimal import Decimal

from orca_common.market.feed_stub_chain import find_market_for_exec_chain, parse_feed_to_stub_chain_map
from orca_common.models.market import YieldMarket


def _market(chain_id: int, protocol: str) -> YieldMarket:
    return YieldMarket(
        chain_id=chain_id,
        chain_name="test",
        protocol=protocol,  # type: ignore[arg-type]
        apy=Decimal("5"),
        tvl_usdc=Decimal("1000000"),
        utilization=Decimal("0.5"),
        timestamp=1,
    )


def test_find_market_for_exec_chain_uses_feed_when_stub_empty() -> None:
    markets = [_market(1, "morpho")]
    feed_to_stub = parse_feed_to_stub_chain_map("")
    found, feed_chain = find_market_for_exec_chain(markets, 11155111, "morpho", feed_to_stub)
    assert found is not None
    assert found.chain_id == 1
    assert feed_chain == 1


def test_find_market_for_exec_chain_direct_on_manifest_chain() -> None:
    markets = [_market(2368, "aave-v3")]
    feed_to_stub = parse_feed_to_stub_chain_map("")
    found, feed_chain = find_market_for_exec_chain(markets, 2368, "aave-v3", feed_to_stub)
    assert found is not None
    assert feed_chain == 2368
