from __future__ import annotations

from decimal import Decimal
import logging

from orca_scout.models import ProtocolName, RankedOpportunity, YieldMarket
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

    def rank_best_stub_deposit(
        self,
        markets: list[YieldMarket],
        suggested_amount_usdc: int,
        max_suggested_amount_usdc: int,
        kite_chain_id: int,
        kite_anchor_protocol: ProtocolName,
    ) -> list[RankedOpportunity]:
        """Pick the single highest-APY stub market (Kite + spokes). Synthetic src leg on Kite for intent builder."""
        if not markets:
            return []
        capped_amount = min(suggested_amount_usdc, max_suggested_amount_usdc)
        best = max(markets, key=lambda m: m.apy)
        anchor_apy = Decimal("0")
        return [
            RankedOpportunity(
                src_chain=kite_chain_id,
                dst_chain=best.chain_id,
                src_protocol=kite_anchor_protocol,
                dst_protocol=best.protocol,
                current_apy=anchor_apy,
                target_apy=best.apy,
                net_delta_apy=best.apy - anchor_apy,
                suggested_amount=capped_amount,
                annualized_bridge_cost_apy=Decimal("0"),
            )
        ]

    def rank_feed_to_stub_deposit(
        self,
        markets: list[YieldMarket],
        manifest_pairs: set[tuple[int, str]],
        feed_to_stub: dict[int, int],
        suggested_amount_usdc: int,
        max_suggested_amount_usdc: int,
        kite_chain_id: int,
        kite_anchor_protocol: ProtocolName,
        max_candidates: int = 5,
    ) -> list[RankedOpportunity]:
        """Rank by real feed APY; map feed chains to manifest stub chains; return top destination protocols for the LLM."""
        if not markets or not manifest_pairs:
            return []
        manifest_chains = {c for c, _ in manifest_pairs}
        capped_amount = min(suggested_amount_usdc, max_suggested_amount_usdc)
        best_by_slot: dict[tuple[int, str], tuple[Decimal, int]] = {}

        for m in markets:
            feed_chain = m.chain_id
            proto_str = str(m.protocol)
            if feed_chain in manifest_chains:
                exec_chain = feed_chain
            else:
                mapped = feed_to_stub.get(feed_chain)
                if mapped is None:
                    continue
                exec_chain = mapped
            if (exec_chain, proto_str) not in manifest_pairs:
                continue
            key = (exec_chain, proto_str)
            prev = best_by_slot.get(key)
            if prev is None or m.apy > prev[0]:
                best_by_slot[key] = (m.apy, feed_chain)

        if not best_by_slot:
            self._logger.info("Feed-ranked stub: no markets mapped to manifest slots (check feeds, TVL, SCOUT_FEED_TO_STUB_CHAIN_MAP).")
            return []

        # Best APY per destination protocol (may be on different exec chains).
        best_by_protocol: dict[str, tuple[Decimal, int, int]] = {}
        for (exec_chain, proto_str), (apy, feed_chain_used) in best_by_slot.items():
            prev = best_by_protocol.get(proto_str)
            if prev is None or apy > prev[0]:
                best_by_protocol[proto_str] = (apy, feed_chain_used, exec_chain)

        ranked_protocols = sorted(best_by_protocol.items(), key=lambda item: item[1][0], reverse=True)[
            : max(1, max_candidates)
        ]
        anchor_apy = Decimal("0")
        opportunities: list[RankedOpportunity] = []
        for proto_str, (best_apy, feed_chain_used, exec_chain) in ranked_protocols:
            dst_protocol = proto_str  # type: ignore[assignment]
            opportunities.append(
                RankedOpportunity(
                    src_chain=kite_chain_id,
                    dst_chain=exec_chain,
                    src_protocol=kite_anchor_protocol,
                    dst_protocol=dst_protocol,
                    current_apy=anchor_apy,
                    target_apy=best_apy,
                    net_delta_apy=best_apy - anchor_apy,
                    suggested_amount=capped_amount,
                    annualized_bridge_cost_apy=Decimal("0"),
                )
            )
        if opportunities:
            top = opportunities[0]
            top_meta = best_by_protocol[str(top.dst_protocol)]
            self._logger.info(
                "Feed-ranked stub: %d candidate(s); top feed_chain=%s exec_chain=%s protocol=%s apy=%s",
                len(opportunities),
                top_meta[1],
                top.dst_chain,
                top.dst_protocol,
                str(top.target_apy),
            )
        return opportunities
