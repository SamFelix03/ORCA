from __future__ import annotations

import logging

from orca_scout.integrations.goldsky_client import GoldskyClient
from orca_scout.integrations.lucid_client import LucidClient
from orca_scout.models import YieldMarket


class YieldScanner:
    def __init__(self, lucid_client: LucidClient, goldsky_client: GoldskyClient) -> None:
        self._lucid = lucid_client
        self._goldsky = goldsky_client
        self._logger = logging.getLogger("orca_scout.yield_scanner")

    async def scan(self) -> list[YieldMarket]:
        # Keep the Goldsky pull in the control loop even when Lucid is the main APY source.
        try:
            await self._goldsky.fetch_recent_protocol_events()
        except Exception as exc:  # noqa: BLE001
            self._logger.warning("Goldsky fetch failed; continuing with Lucid scan: %s", exc)
        return await self._lucid.fetch_markets()
