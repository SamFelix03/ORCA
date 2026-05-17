from __future__ import annotations

from decimal import Decimal

import pytest
from eth_account import Account
from web3 import Web3

from orca_common.events import ExecutionIntent, RiskInstruction
from orca_executor.config import ExecutorConfig
from orca_executor.path_resolution import resolve_execution_path


def _minimal_config(**overrides: object) -> ExecutorConfig:
    base = dict(
        REDIS_URL="redis://localhost:6379",
        EXECUTOR_AGENT_DID="did:kite:orca/executor-1",
        EXECUTOR_PRIVATE_KEY="0x" + "11" * 32,
        AUDIT_AGENT_DID="did:kite:orca/audit-1",
        KITE_CHAIN_ID=2368,
        KITE_RPC_URL="https://rpc-testnet.gokite.ai",
        POAI_CONTRACT_ADDRESS="0x" + "22" * 20,
        X402_SERVICE_URL="http://127.0.0.1:8099",
        X402_ASSET_ADDRESS="0x" + "33" * 20,
    )
    base.update(overrides)
    return ExecutorConfig(**base)


def _instruction(*, dst_chain: int, intent: ExecutionIntent) -> RiskInstruction:
    return RiskInstruction(
        instruction_id="i1",
        signal_id="s1",
        risk_did="did:kite:orca/risk-1",
        executor_did="did:kite:orca/executor-1",
        approved=True,
        reason="ok",
        src_chain=2368,
        dst_chain=dst_chain,
        src_protocol="morpho",
        dst_protocol="uniswap-v3",
        suggested_amount=100_000_000_000_000_000,
        net_delta_apy=Decimal("1"),
        execution_intent=intent,
        signature="0x",
        timestamp=1,
    )


def test_resolve_warp_to_stub_base_sepolia() -> None:
    stub = Account.create().address
    intent = ExecutionIntent(
        vault_address=Account.create().address,
        target_address=Account.create().address,
        tx_value_wei=0,
        amount_for_rule=100,
        from_protocol=Account.create().address,
        to_protocol=stub,
        destination_domain=84532,
        destination_adapter="0x" + "00" * 32,
        oapp_calldata="0x09a3e9ee",
        vault_execute_calldata="0x74420f4c",
    )
    config = _minimal_config(EXECUTOR_CROSS_CHAIN_MODE="warp_to_stub")
    resolved = resolve_execution_path(_instruction(dst_chain=84532, intent=intent), config)
    assert resolved is not None
    assert resolved.execution_path == "warp_to_stub"
    assert resolved.proceed is True


def test_resolve_kite_deposit() -> None:
    stub = Account.create().address
    intent = ExecutionIntent(
        vault_address=Account.create().address,
        target_address=Account.create().address,
        tx_value_wei=0,
        amount_for_rule=100,
        from_protocol=stub,
        to_protocol=stub,
        destination_domain=2368,
        destination_adapter="0x" + "00" * 32,
        oapp_calldata="0x",
        vault_execute_calldata="0x",
        kite_stub_address=stub,
        kite_stub_calldata="0x" + "ab" * 4,
    )
    config = _minimal_config()
    resolved = resolve_execution_path(_instruction(dst_chain=2368, intent=intent), config)
    assert resolved is not None
    assert resolved.execution_path == "kite_deposit"


def test_resolve_none_without_stub_address() -> None:
    intent = ExecutionIntent(
        vault_address=Account.create().address,
        target_address=Account.create().address,
        tx_value_wei=0,
        amount_for_rule=100,
        from_protocol=Account.create().address,
        to_protocol="not-an-address",
        destination_domain=84532,
        destination_adapter="0x" + "00" * 32,
        oapp_calldata="0x",
        vault_execute_calldata="0x",
    )
    config = _minimal_config(EXECUTOR_CROSS_CHAIN_MODE="warp_to_stub")
    assert resolve_execution_path(_instruction(dst_chain=84532, intent=intent), config) is None
