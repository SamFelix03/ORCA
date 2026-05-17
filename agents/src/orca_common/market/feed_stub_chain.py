from __future__ import annotations

from orca_common.models.market import YieldMarket

# Mainnet chain IDs → ORCA stub deployment testnets (DefiLlama feed → execution chain).
DEFAULT_FEED_TO_STUB_CHAIN: dict[int, int] = {
    1: 11155111,
    42161: 421614,
    10: 11155420,
    8453: 84532,
}


def parse_feed_to_stub_chain_map(raw: str) -> dict[int, int]:
    """Parse SCOUT_FEED_TO_STUB_CHAIN_MAP CSV; merge on top of defaults."""
    merged: dict[int, int] = dict(DEFAULT_FEED_TO_STUB_CHAIN)
    for entry in raw.split(","):
        item = entry.strip()
        if not item:
            continue
        parts = item.split(":")
        if len(parts) != 2:
            raise ValueError(
                f"Invalid SCOUT_FEED_TO_STUB_CHAIN_MAP item '{item}'. Expected 'feedChainId:stubChainId'."
            )
        feed_raw, stub_raw = parts[0].strip(), parts[1].strip()
        if not feed_raw.isdigit() or not stub_raw.isdigit():
            raise ValueError(f"Invalid SCOUT_FEED_TO_STUB_CHAIN_MAP item '{item}' (chain ids must be integers).")
        merged[int(feed_raw)] = int(stub_raw)
    return merged


def stub_to_feed_chains(feed_to_stub: dict[int, int]) -> dict[int, list[int]]:
    """Invert feed→stub map (multiple feeds may map to the same stub)."""
    out: dict[int, list[int]] = {}
    for feed_chain, stub_chain in feed_to_stub.items():
        out.setdefault(stub_chain, []).append(feed_chain)
    return out


def find_market_on_chain(
    markets: list[YieldMarket],
    chain_id: int,
    protocol: str,
) -> YieldMarket | None:
    protocol_key = protocol.strip()
    for item in markets:
        if item.chain_id == chain_id and str(item.protocol) == protocol_key:
            return item
    return None


def find_market_for_exec_chain(
    markets: list[YieldMarket],
    exec_chain_id: int,
    protocol: str,
    feed_to_stub: dict[int, int],
) -> tuple[YieldMarket | None, int | None]:
    """
    Resolve a live feed pool for an execution (stub) chain + protocol.

    Tries exact exec chain first, then feed chains that Scout maps onto this stub
    (same logic as rank_feed_to_stub_deposit).
    Returns (market, feed_chain_id_used) — feed_chain_id equals exec_chain_id when direct.
    """
    direct = find_market_on_chain(markets, exec_chain_id, protocol)
    if direct is not None:
        return direct, exec_chain_id

    for feed_chain in stub_to_feed_chains(feed_to_stub).get(exec_chain_id, []):
        mapped = find_market_on_chain(markets, feed_chain, protocol)
        if mapped is not None:
            return mapped, feed_chain

    return None, None
