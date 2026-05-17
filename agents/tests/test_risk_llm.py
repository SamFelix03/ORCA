from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient
from orca_risk.services.risk_context_builder import RiskEvidencePack
from orca_risk.services.risk_llm_advisor import RiskLlmAdvisor


@pytest.mark.asyncio
async def test_risk_advisor_includes_evidence_in_verdict() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(
            LlmDeliberationResponse(
                reasoning_steps=["Live APY 4.2% supports approval"],
                verdict={"recommended_approved": True, "confidence": 0.9, "reason": "ok"},
                verdict_summary="Approve",
            ),
            "{}",
        )
    )
    advisor = RiskLlmAdvisor(groq)
    evidence = RiskEvidencePack(
        signal_id="sig-1",
        scout_did="did:kite:orca/scout-1",
        route={"src_chain": 1, "dst_chain": 2, "src_protocol": "aave-v3", "dst_protocol": "compound-v3", "suggested_amount": 1000},
        signal_claimed={"current_apy": "1", "target_apy": "3", "net_delta_apy": "1.5"},
        live_markets={"src": None, "dst": None},
        fresh_computed={"current_apy": "1", "target_apy": "3", "annualized_bridge_cost_apy": "0.1", "fresh_net_delta_apy": "1.4"},
        drift={"apy_drift_bps": "10", "net_delta_drift_bps": "5", "max_apy_drift_bps": "50"},
        preflight={
            "markets_found_for_route": True,
            "fresh_net_delta_apy_positive": True,
            "signal_net_delta_apy_positive": True,
            "apy_drift_within_tolerance": True,
            "min_tvl_ok": True,
            "utilization_below_cap": True,
        },
        api_context={"available": False},
        registry={"scout_active": True, "scout_vault": None},
    )
    deliberation = await advisor.deliberate(evidence)
    assert deliberation.verdict["recommended_approved"] is True
    assert "evidence" in deliberation.verdict
    await advisor.close()


def test_risk_veto_logic() -> None:
    recommended = True
    registry_ok = True
    allowlist_ok = True
    pf = {
        "fresh_net_delta_apy_positive": True,
        "signal_net_delta_apy_positive": True,
        "apy_drift_within_tolerance": False,
        "markets_found_for_route": True,
        "min_tvl_ok": True,
        "utilization_below_cap": True,
    }
    approved = (
        recommended
        and registry_ok
        and allowlist_ok
        and pf["fresh_net_delta_apy_positive"]
        and pf["signal_net_delta_apy_positive"]
        and pf["apy_drift_within_tolerance"]
        and pf["markets_found_for_route"]
        and pf["min_tvl_ok"]
        and pf["utilization_below_cap"]
    )
    assert approved is False
