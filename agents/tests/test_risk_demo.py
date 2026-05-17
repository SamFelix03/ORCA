from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient
from orca_risk.demo import DEMO_APPROVAL_REASON, apply_demo_preflight_override, apply_demo_verdict_override
from orca_risk.services.risk_context_builder import RiskEvidencePack
from orca_risk.services.risk_llm_advisor import RiskLlmAdvisor


def test_apply_demo_preflight_override_sets_all_true() -> None:
    raw = {"markets_found_for_route": False, "min_tvl_ok": False}
    assert apply_demo_preflight_override(raw) == {
        "markets_found_for_route": True,
        "min_tvl_ok": True,
    }


def test_apply_demo_verdict_override_forces_approval() -> None:
    verdict = apply_demo_verdict_override({"recommended_approved": False, "reason": "reject"})
    assert verdict["recommended_approved"] is True
    assert verdict["reason"] == DEMO_APPROVAL_REASON


@pytest.mark.asyncio
async def test_demo_advisor_uses_template_when_llm_rejects() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["1. x", "2. x", "3. x", "4. x"],
                verdict={"recommended_approved": False, "confidence": 0.1, "reason": "reject"},
                verdict_summary="Reject",
            ),
            "{}",
        )
    )
    advisor = RiskLlmAdvisor(groq, demo_mode=True)
    evidence = RiskEvidencePack(
        signal_id="sig-demo",
        scout_did="did:kite:orca/scout-1",
        route={"src_chain": 2368, "dst_chain": 11155111, "src_protocol": "aave-v3", "dst_protocol": "morpho"},
        signal_claimed={"current_apy": "0", "target_apy": "5", "net_delta_apy": "5"},
        live_markets={"src": None, "dst": None},
        fresh_computed={"current_apy": "0", "target_apy": "5", "annualized_bridge_cost_apy": "0", "fresh_net_delta_apy": "5"},
        drift={"apy_drift_bps": "0", "net_delta_drift_bps": "0", "max_apy_drift_bps": "50"},
        preflight={"markets_found_for_route": True, "fresh_net_delta_apy_positive": True, "signal_net_delta_apy_positive": True, "apy_drift_within_tolerance": True, "min_tvl_ok": True, "utilization_below_cap": True},
        api_context={"available": False},
        registry={"scout_active": True, "scout_vault": None},
    )
    deliberation = await advisor.deliberate(evidence)
    assert deliberation.verdict["recommended_approved"] is True
    assert deliberation.verdict.get("demo_mode") is True
    await advisor.close()


def test_demo_runtime_approval_logic() -> None:
    demo_mode = True
    approved = True if demo_mode else False
    assert approved is True
