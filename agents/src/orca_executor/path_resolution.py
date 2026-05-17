from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from web3 import Web3

from orca_common.events import RiskInstruction
from orca_executor.config import ExecutorConfig
from orca_executor.spoke_prep import CHAIN_ID_TO_HYP_DEST

PathSource = Literal["deterministic", "llm"]


@dataclass(frozen=True)
class ResolvedExecutionPath:
    execution_path: str
    proceed: bool
    reason: str
    source: PathSource


def resolve_execution_path(
    instruction: RiskInstruction,
    config: ExecutorConfig,
) -> ResolvedExecutionPath | None:
    """
    Derive execution_path from instruction + env when unambiguous.

    Spoke warps and Kite stub deposits must not depend on LLM choosing the right path.
    """
    intent = instruction.execution_intent
    if intent is None:
        return None

    dst = instruction.dst_chain
    kite = config.kite_chain_id

    if dst == kite:
        kite_addr = intent.kite_stub_address.strip()
        kite_data = intent.kite_stub_calldata.strip()
        if kite_addr and Web3.is_address(kite_addr) and kite_data and kite_data.lower() not in ("0x", "0x0"):
            return ResolvedExecutionPath(
                execution_path="kite_deposit",
                proceed=True,
                reason=f"dst_chain={kite} with kite_stub deposit calldata",
                source="deterministic",
            )
        return None

    if dst not in CHAIN_ID_TO_HYP_DEST:
        return None

    if config.executor_cross_chain_mode == "warp_to_stub":
        stub = intent.to_protocol.strip()
        if not stub or not Web3.is_address(stub):
            return None
        hyp = CHAIN_ID_TO_HYP_DEST[dst]
        return ResolvedExecutionPath(
            execution_path="warp_to_stub",
            proceed=True,
            reason=(
                f"dst_chain={dst} ({hyp}) with EXECUTOR_CROSS_CHAIN_MODE=warp_to_stub; "
                f"stub={Web3.to_checksum_address(stub)}"
            ),
            source="deterministic",
        )

    calldata = intent.vault_execute_calldata.strip()
    if calldata and calldata.lower() not in ("0x", "0x0"):
        return ResolvedExecutionPath(
            execution_path="hub_bridge_then_vault",
            proceed=True,
            reason=f"dst_chain={dst} with legacy vault_execute_calldata (mailbox_oapp)",
            source="deterministic",
        )

    return None
