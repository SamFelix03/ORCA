from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from orca_common.llm.deliberation import LlmDeliberation
from orca_scout.models import ExecutionIntent, YieldSignal


class ScoutSignalEvent(BaseModel):
    event: Literal["scout.signal.created"]
    signal: YieldSignal
    paymentTxHash: str
    llm_deliberation: LlmDeliberation


class RiskInstruction(BaseModel):
    instruction_id: str
    signal_id: str
    risk_did: str
    executor_did: str
    approved: bool
    reason: str
    src_chain: int
    dst_chain: int
    src_protocol: str
    dst_protocol: str
    suggested_amount: int
    net_delta_apy: Decimal = Field(..., ge=Decimal("0"))
    execution_intent: ExecutionIntent | None = None
    signature: str
    timestamp: int


class RiskInstructionEvent(BaseModel):
    event: Literal["risk.instruction.created"]
    instruction: RiskInstruction
    sourceSignalHash: str
    paymentTxHash: str
    paymentAmountWei: str | None = None
    paymentAsset: str | None = None
    paymentNetwork: str | None = None
    llm_deliberation: LlmDeliberation


class ExecutionSettledEvent(BaseModel):
    event: Literal["execution.settled"]
    instruction_id: str
    signal_id: str
    executor_did: str
    success: bool
    status: str
    tx_hash: str
    txChainId: int | None = None
    vaultTxHash: str | None = None
    vaultTxChainId: int | None = None
    poaiTxHash: str | None = None
    poaiChainId: int | None = None
    relatedTxs: list[dict[str, object]] = Field(default_factory=list)
    paymentTxHash: str
    paymentAmountWei: str | None = None
    paymentAsset: str | None = None
    paymentNetwork: str | None = None
    timestamp: int
    llm_deliberation: LlmDeliberation | None = None
