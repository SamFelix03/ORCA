from __future__ import annotations

from decimal import Decimal
import logging

from orca_scout.models import RankedOpportunity, YieldMarket
from orca_scout.services.bridge_cost_estimator import BridgeCostEstimator


class OpportunityRanker:
    def __init__(self, bridge_cost_estimator: BridgeCostEstimator, allowed_routes: set[tuple[int, int]] | None = None) -> None:
        self._bridge_cost_estimator = bridge_cost_estimator
        self._allowed_routes = allowed_routes
        self._logger = logging.getLogger("orca_scout.opportunity_ranker")

    async def rank(
        self,
        markets: list[YieldMarket],
        min_net_delta_apy: Decimal,
        suggested_amount_usdc: int,
        max_suggested_amount_usdc: int,
    ) -> list[RankedOpportunity]:
        opportunities: list[RankedOpportunity] = []
        capped_amount = min(suggested_amount_usdc, max_suggested_amount_usdc)
        sorted_markets = sorted(markets, key=lambda m: m.apy, reverse=True)
        skipped_same_market = 0
        skipped_non_positive_delta = 0
        skipped_route = 0
        skipped_threshold = 0

        for target in sorted_markets:
            for source in sorted_markets[::-1]:
                if source.chain_id == target.chain_id and source.protocol == target.protocol:
                    skipped_same_market += 1
                    continue
                if target.apy <= source.apy:
                    skipped_non_positive_delta += 1
                    continue
                if self._allowed_routes is not None and (source.chain_id, target.chain_id) not in self._allowed_routes:
                    skipped_route += 1
                    continue

                bridge_cost_apy = await self._bridge_cost_estimator.estimate_annualized_cost_apy(
                    source.chain_id, target.chain_id, capped_amount
                )
                net_delta = (target.apy - source.apy) - bridge_cost_apy

                if net_delta < min_net_delta_apy:
                    skipped_threshold += 1
                    continue

                opportunities.append(
                    RankedOpportunity(
                        src_chain=source.chain_id,
                        dst_chain=target.chain_id,
                        src_protocol=source.protocol,
                        dst_protocol=target.protocol,
                        current_apy=source.apy,
                        target_apy=target.apy,
                        net_delta_apy=net_delta,
                        suggested_amount=capped_amount,
                        annualized_bridge_cost_apy=bridge_cost_apy,
                    )
                )

        ranked = sorted(opportunities, key=lambda item: item.net_delta_apy, reverse=True)
        self._logger.info(
            "Ranker summary markets=%d candidates=%d skipped_same=%d skipped_non_positive=%d skipped_route=%d skipped_threshold=%d threshold=%s",
            len(sorted_markets),
            len(ranked),
            skipped_same_market,
            skipped_non_positive_delta,
            skipped_route,
            skipped_threshold,
            str(min_net_delta_apy),
        )
        if ranked:
            top = ranked[:3]
            self._logger.info(
                "Ranker top_candidates=%s",
                " | ".join(
                    f"{item.src_protocol}@{item.src_chain}->{item.dst_protocol}@{item.dst_chain}:net={item.net_delta_apy} bridge={item.annualized_bridge_cost_apy}"
                    for item in top
                ),
            )
        return ranked
