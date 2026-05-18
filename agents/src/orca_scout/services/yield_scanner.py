from __future__ import annotations

import logging

from orca_scout.integrations.protocol_enrichers import UtilizationEnricher
from orca_common.models.market import YieldMarket


class YieldScanner:
    def __init__(
        self,
        market_feed_client: object,
        enrichers: list[UtilizationEnricher] | None = None,
    ) -> None:
        self._market_feed_client = market_feed_client
        self._enrichers = enrichers or []
        self._logger = logging.getLogger("orca_scout.yield_scanner")

    async def scan(self) -> list[YieldMarket]:
        fetch_markets = getattr(self._market_feed_client, "fetch_markets")
        markets = await fetch_markets()
        self._logger.info("Market feed returned markets=%d", len(markets))
        for enricher in self._enrichers:
            before = len(markets)
            markets = await enricher.enrich(markets)
            self._logger.info("Enricher %s completed markets_before=%d markets_after=%d", enricher, before, len(markets))
        if markets:
            top = sorted(markets, key=lambda item: item.apy, reverse=True)[:3]
            self._logger.info(
                "Scan top_markets=%s",
                " | ".join(
                    f"{item.protocol}@{item.chain_id}:apy={item.apy} util={item.utilization} tvl={item.tvl_usdc}"
                    for item in top
                ),
            )
        return markets
