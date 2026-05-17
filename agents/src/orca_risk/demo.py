from __future__ import annotations

from typing import TYPE_CHECKING

from orca_common.llm import LlmDeliberation
from orca_common.llm.deliberation import LlmDeliberationResponse

if TYPE_CHECKING:
    from orca_risk.services.risk_context_builder import RiskEvidencePack

DEMO_APPROVAL_REASON = "Demo mode: auto-approved for end-to-end pipeline demonstration."


def apply_demo_preflight_override(preflight: dict[str, bool]) -> dict[str, bool]:
    """Present all-clear preflight flags to the demo LLM prompt."""
    return {key: True for key in preflight}


def apply_demo_verdict_override(verdict: dict[str, object]) -> dict[str, object]:
    """Force approval fields after LLM response (demo code path)."""
    normalized = dict(verdict)
    normalized["recommended_approved"] = True
    normalized["confidence"] = normalized.get("confidence", 0.95)
    normalized["reason"] = DEMO_APPROVAL_REASON
    citations = normalized.get("evidence_citations")
    if not isinstance(citations, dict):
        normalized["evidence_citations"] = {
            "route": "demo",
            "live_markets": "demo",
            "fresh_computed": "demo",
            "preflight": "demo_mode_all_clear",
        }
    return normalized


def build_demo_risk_deliberation(evidence: "RiskEvidencePack", *, model: str) -> LlmDeliberation:
    """Synthetic deliberation when demo mode skips or recovers from LLM failure."""
    route = evidence.route
    signal_id = evidence.signal_id
    net_delta = evidence.signal_claimed.get("net_delta_apy", "?")
    steps = [
        f"1. Demo mode: reviewing signal {signal_id} route "
        f"{route.get('src_protocol')}@{route.get('src_chain')}→"
        f"{route.get('dst_protocol')}@{route.get('dst_chain')}.",
        f"2. Demo mode: signal net_delta_apy={net_delta}; live market strict checks deferred.",
        "3. Demo mode: fresh metrics recorded for UI; approval does not require production drift gates.",
        "4. Demo mode: preflight overridden to pass; proceeding to Executor with execution_intent intact.",
    ]
    response = LlmDeliberationResponse(
        reasoning_steps=steps,
        verdict={
            "recommended_approved": True,
            "confidence": 0.95,
            "reason": DEMO_APPROVAL_REASON,
            "evidence_citations": {
                "route": f"net_delta_apy={net_delta}",
                "live_markets": "demo_deferred",
                "fresh_computed": evidence.fresh_computed.get("fresh_net_delta_apy", "n/a"),
                "preflight": "demo_mode_all_clear",
            },
            "evidence": evidence.model_dump(),
            "demo_mode": True,
        },
        verdict_summary=f"Demo approve: signal {signal_id} cleared for executor.",
    )
    return LlmDeliberation.from_response(
        agent_type="risk",
        model=model,
        response=response,
        raw_content=None,
    )
