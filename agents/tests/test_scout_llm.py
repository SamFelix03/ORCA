from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient
from orca_scout.models import RankedOpportunity
from orca_scout.services.llm_opportunity_selector import LLMOpportunitySelector


@pytest.mark.asyncio
async def test_select_best_valid_index() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["pick 1"],
                verdict={"selected_index": 1, "reason": "best"},
                verdict_summary="Picked index 1",
            ),
            "{}",
        )
    )
    selector = LLMOpportunitySelector(groq, max_candidates=5)
    ranked = [
        RankedOpportunity(
            src_chain=1,
            dst_chain=2,
            src_protocol="aave-v3",
            dst_protocol="compound-v3",
            current_apy=Decimal("1"),
            target_apy=Decimal("3"),
            net_delta_apy=Decimal("1.5"),
            suggested_amount=1000,
            annualized_bridge_cost_apy=Decimal("0.5"),
        ),
        RankedOpportunity(
            src_chain=1,
            dst_chain=2,
            src_protocol="morpho",
            dst_protocol="uniswap-v3",
            current_apy=Decimal("2"),
            target_apy=Decimal("5"),
            net_delta_apy=Decimal("2.5"),
            suggested_amount=1000,
            annualized_bridge_cost_apy=Decimal("0.5"),
        ),
    ]
    best, deliberation = await selector.select_best(ranked)
    assert best.dst_protocol == "uniswap-v3"
    assert deliberation.agent_type == "scout"
    await selector.close()


@pytest.mark.asyncio
async def test_select_best_invalid_index_raises() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["bad"],
                verdict={"selected_index": 99},
                verdict_summary="bad",
            ),
            "{}",
        )
    )
    selector = LLMOpportunitySelector(groq, max_candidates=5)
    ranked = [
        RankedOpportunity(
            src_chain=1,
            dst_chain=2,
            src_protocol="aave-v3",
            dst_protocol="compound-v3",
            current_apy=Decimal("1"),
            target_apy=Decimal("3"),
            net_delta_apy=Decimal("1.5"),
            suggested_amount=1000,
            annualized_bridge_cost_apy=Decimal("0.5"),
        ),
    ]
    with pytest.raises(RuntimeError, match="invalid selected_index"):
        await selector.select_best(ranked)
    await selector.close()
