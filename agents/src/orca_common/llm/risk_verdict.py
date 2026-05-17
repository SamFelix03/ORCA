from __future__ import annotations

from typing import Any

from orca_common.llm.deliberation import LlmDeliberationResponse

_APPROVED_ALIASES = (
    "recommended_approved",
    "approved",
    "recommend_approval",
    "recommendation",
)
_CONFIDENCE_ALIASES = ("confidence", "confidence_score", "score")
_REASON_ALIASES = ("reason", "rationale", "explanation", "summary_reason")
_CITATION_SECTIONS = ("route", "live_markets", "fresh_computed", "preflight")


def _coerce_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "yes", "approve", "approved", "1"):
            return True
        if normalized in ("false", "no", "reject", "rejected", "deny", "denied", "0"):
            return False
    return None


def _coerce_confidence(value: object) -> float | None:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        score = float(value)
        if score > 1.0 and score <= 100.0:
            score = score / 100.0
        if 0.0 <= score <= 1.0:
            return score
    if isinstance(value, str):
        text = value.strip().rstrip("%")
        try:
            return _coerce_confidence(float(text))
        except ValueError:
            return None
    return None


def _first_present(mapping: dict[str, Any], keys: tuple[str, ...]) -> object | None:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def normalize_risk_verdict(verdict: dict[str, Any]) -> dict[str, Any]:
    """Normalize common Groq variants into the risk runtime contract."""
    approved_raw = _first_present(verdict, _APPROVED_ALIASES)
    approved = _coerce_bool(approved_raw)
    if approved is None:
        raise RuntimeError(
            "Risk LLM verdict missing boolean recommended_approved "
            f"(got {approved_raw!r})"
        )

    confidence_raw = _first_present(verdict, _CONFIDENCE_ALIASES)
    confidence = _coerce_confidence(confidence_raw)
    if confidence is None:
        raise RuntimeError(
            f"Risk LLM verdict missing numeric confidence 0-1 (got {confidence_raw!r})"
        )

    reason_raw = _first_present(verdict, _REASON_ALIASES)
    if not isinstance(reason_raw, str) or len(reason_raw.strip()) < 10:
        raise RuntimeError("Risk LLM verdict reason must be a non-empty string (min 10 chars)")
    reason = reason_raw.strip()

    citations_raw = verdict.get("evidence_citations") or verdict.get("evidence") or verdict.get("citations")
    citations: dict[str, str] = {}
    if isinstance(citations_raw, dict):
        for section in _CITATION_SECTIONS:
            value = citations_raw.get(section)
            if isinstance(value, str) and value.strip():
                citations[section] = value.strip()
            elif value is not None and not isinstance(value, (dict, list)):
                citations[section] = str(value).strip()

    if len(citations) < 2:
        raise RuntimeError(
            "Risk LLM verdict must include evidence_citations with at least route and preflight strings"
        )

    return {
        "recommended_approved": approved,
        "confidence": confidence,
        "reason": reason,
        "evidence_citations": citations,
    }


def validate_risk_deliberation(response: LlmDeliberationResponse) -> LlmDeliberationResponse:
    if len(response.reasoning_steps) < 4:
        raise RuntimeError(
            f"Risk LLM must return at least 4 reasoning_steps (got {len(response.reasoning_steps)})"
        )
    for idx, step in enumerate(response.reasoning_steps, start=1):
        text = step.strip()
        if len(text) < 20:
            raise RuntimeError(f"Risk LLM reasoning_steps[{idx - 1}] is too short")
    summary = response.verdict_summary.strip()
    if len(summary) < 10:
        raise RuntimeError("Risk LLM verdict_summary must be at least 10 characters")
    normalized_verdict = normalize_risk_verdict(response.verdict)
    return LlmDeliberationResponse(
        reasoning_steps=response.reasoning_steps,
        verdict=normalized_verdict,
        verdict_summary=summary,
    )
