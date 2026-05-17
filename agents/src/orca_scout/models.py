from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Literal, NotRequired, TypedDict

from pydantic import BaseModel, Field

from orca_common.models.market import ProtocolName, YieldMarket  # noqa: F401


class YieldSignalDict(TypedDict):
    signal_id: str
    scout_did: str
    src_chain: int
    dst_chain: int
    src_protocol: ProtocolName
    dst_protocol: ProtocolName
    current_apy: str
    target_apy: str
    net_delta_apy: str
    suggested_amount: int
    signature: str
    timestamp: int
    execution_intent: "ExecutionIntentDict | None"


class ExecutionIntentDict(TypedDict):
    vault_address: str
    target_address: str
    tx_value_wei: int
    amount_for_rule: int
    from_protocol: str
    to_protocol: str
    destination_domain: int
    destination_adapter: str
    oapp_calldata: str
    vault_execute_calldata: str
    kite_stub_address: NotRequired[str]
    kite_stub_calldata: NotRequired[str]


class ActionType(str, Enum):
    SIGNAL = "SIGNAL"
    RISK_EVAL = "RISK_EVAL"
    EXECUTION = "EXECUTION"
    AUDIT = "AUDIT"


class RankedOpportunity(BaseModel):
    src_chain: int
    dst_chain: int
    src_protocol: ProtocolName
    dst_protocol: ProtocolName
    current_apy: Decimal
    target_apy: Decimal
    net_delta_apy: Decimal
    suggested_amount: int
    annualized_bridge_cost_apy: Decimal


class YieldSignal(BaseModel):
    signal_id: str
    scout_did: str
    src_chain: int
    dst_chain: int
    src_protocol: ProtocolName
    dst_protocol: ProtocolName
    current_apy: Decimal
    target_apy: Decimal
    net_delta_apy: Decimal
    suggested_amount: int
    signature: str
    timestamp: int
    execution_intent: "ExecutionIntent | None" = None

    def to_wire(self) -> YieldSignalDict:
        return YieldSignalDict(
            signal_id=self.signal_id,
            scout_did=self.scout_did,
            src_chain=self.src_chain,
            dst_chain=self.dst_chain,
            src_protocol=self.src_protocol,
            dst_protocol=self.dst_protocol,
            current_apy=str(self.current_apy),
            target_apy=str(self.target_apy),
            net_delta_apy=str(self.net_delta_apy),
            suggested_amount=self.suggested_amount,
            signature=self.signature,
            timestamp=self.timestamp,
            execution_intent=self.execution_intent.to_wire() if self.execution_intent else None,
        )


class ExecutionIntent(BaseModel):
    vault_address: str
    target_address: str
    tx_value_wei: int
    amount_for_rule: int
    from_protocol: str
    to_protocol: str
    destination_domain: int
    destination_adapter: str
    oapp_calldata: str
    vault_execute_calldata: str
    """Same-chain Kite stub deposit: executor sends this calldata to this stub (no OApp)."""
    kite_stub_address: str = ""
    kite_stub_calldata: str = ""

    def to_wire(self) -> ExecutionIntentDict:
        base = ExecutionIntentDict(
            vault_address=self.vault_address,
            target_address=self.target_address,
            tx_value_wei=self.tx_value_wei,
            amount_for_rule=self.amount_for_rule,
            from_protocol=self.from_protocol,
            to_protocol=self.to_protocol,
            destination_domain=self.destination_domain,
            destination_adapter=self.destination_adapter,
            oapp_calldata=self.oapp_calldata,
            vault_execute_calldata=self.vault_execute_calldata,
        )
        if self.kite_stub_address.strip():
            base["kite_stub_address"] = self.kite_stub_address
        if self.kite_stub_calldata.strip():
            base["kite_stub_calldata"] = self.kite_stub_calldata
        return base


class PoAIRecord(BaseModel):
    agent_did_hash: bytes
    action_type: ActionType
    input_hash: bytes
    outcome_hash: bytes
    value_delta: int
    timestamp: int
