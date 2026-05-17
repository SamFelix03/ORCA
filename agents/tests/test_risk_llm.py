from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from orca_common.llm.deliberation import LlmDeliberationResponse
from orca_common.llm.groq_client import GroqDeliberationClient
from orca_common.llm.risk_verdict import normalize_risk_verdict, validate_risk_deliberation
from orca_risk.services.risk_context_builder import RiskEvidencePack
from orca_risk.services.risk_llm_advisor import RiskLlmAdvisor


def _valid_risk_response(*, approved: bool = True) -> LlmDeliberationResponse:
    return LlmDeliberationResponse(
        reasoning_steps=[
            "1. Route 2368→84532 with signal net_delta_apy=1.50% on aave-v3→compound-v3.",
            "2. Live src apy=2.10% tvl_usdc=5000000 util=0.40; dst apy=4.00% tvl_usdc=8000000 util=0.35.",
            "3. fresh_net_delta_apy=1.40%; apy_drift_bps=10 within max_apy_drift_bps=50.",
            "4. preflight markets_found_for_route=true and all other preflight flags true.",
        ],
        verdict={
            "recommended_approved": approved,
            "confidence": 0.9,
            "reason": "Approve: positive net delta with drift within tolerance and all checks pass.",
            "evidence_citations": {
                "route": "net_delta_apy=1.50",
                "live_markets": "src_apy=2.10 dst_apy=4.00",
                "fresh_computed": "fresh_net_delta_apy=1.40",
                "preflight": "all preflight flags true",
            },
        },
        verdict_summary="Approve: drift within tolerance and all preflight checks pass.",
    )


@pytest.mark.asyncio
async def test_risk_advisor_includes_evidence_in_verdict() -> None:
    groq = GroqDeliberationClient("k", "m", "https://api.groq.com/openai/v1", 5.0)
    groq.deliberate = AsyncMock(  # type: ignore[method-assign]
        return_value=(_valid_risk_response(), "{}"),
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


def test_normalize_risk_verdict_coerces_string_booleans() -> None:
    normalized = normalize_risk_verdict(
        {
            "approved": "true",
            "confidence_score": "85",
            "rationale": "Reject because drift exceeds configured tolerance.",
            "evidence_citations": {
                "route": "net_delta_apy=1.2",
                "preflight": "apy_drift_within_tolerance=false",
            },
        }
    )
    assert normalized["recommended_approved"] is True
    assert normalized["confidence"] == 0.85
    assert "evidence_citations" in normalized


def test_validate_risk_deliberation_requires_four_steps() -> None:
    response = _valid_risk_response()
    response.reasoning_steps = response.reasoning_steps[:2]
    with pytest.raises(RuntimeError, match="at least 4 reasoning_steps"):
        validate_risk_deliberation(response)


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
