#!/usr/bin/env python3
"""Smoke-test the executor's ClientAgentVault.execute path (same encoding as Scout ExecutionIntent).

Default: `eth_estimateGas` only (no broadcast). With `--broadcast`, submits the transaction.

Run from repo root or from `agents/`:

  cd agents
  python scripts/smoke_executor_vault.py

Requires the same `.env` keys as Scout execution intent + executor (`CLIENT_AGENT_VAULT_ADDRESS`,
`ORCA_OAPP_ADDRESS`, `HYP_TRUSTED_REMOTES`, `KITE_*`, `EXECUTOR_PRIVATE_KEY`, and either
`SCOUT_PROTOCOL_ADDRESS_MAP` or `ORCA_STUB_PROTOCOL_MANIFEST_PATH`).
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from web3.exceptions import ContractCustomError

_SCRIPT_DIR = Path(__file__).resolve().parent
_AGENTS_ROOT = _SCRIPT_DIR.parent
_SRC = _AGENTS_ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from orca_scout.config import ScoutConfig  # noqa: E402
from orca_scout.models import RankedOpportunity  # noqa: E402
from orca_scout.services.execution_intent_builder import ExecutionIntentBuilder  # noqa: E402
from orca_executor.vault_tx import estimate_vault_execute_intent_gas, submit_vault_execute_intent  # noqa: E402


def _load_dotenv() -> None:
    load_dotenv(_AGENTS_ROOT / ".env")


def _protocol_map_csv() -> str:
    raw = os.getenv("SCOUT_PROTOCOL_ADDRESS_MAP", "").strip()
    if raw:
        return raw
    manifest = os.getenv("ORCA_STUB_PROTOCOL_MANIFEST_PATH", "config/orca-stub-protocols.json").strip()
    path = Path(manifest)
    if not path.is_absolute():
        path = _AGENTS_ROOT / path
    if not path.is_file():
        raise SystemExit(f"Stub manifest not found at {path}. Set SCOUT_PROTOCOL_ADDRESS_MAP or ORCA_STUB_PROTOCOL_MANIFEST_PATH.")
    return ScoutConfig.stub_manifest_to_protocol_csv(str(path))


def _build_intent(args: argparse.Namespace):
    kite_chain = int(os.getenv("KITE_CHAIN_ID", "0"))
    if kite_chain <= 0:
        raise SystemExit("KITE_CHAIN_ID must be set in the environment.")

    builder = ExecutionIntentBuilder(
        enabled=True,
        client_agent_vault_address=os.getenv("CLIENT_AGENT_VAULT_ADDRESS", "").strip(),
        orca_oapp_address=os.getenv("ORCA_OAPP_ADDRESS", "").strip(),
        protocol_map_raw=_protocol_map_csv(),
        trusted_remotes_raw=os.getenv("HYP_TRUSTED_REMOTES", "").strip(),
        hook_metadata_hex=os.getenv("SCOUT_EXECUTION_HOOK_METADATA_HEX", "0x"),
        tx_value_wei=int(os.getenv("SCOUT_EXECUTION_TX_VALUE_WEI", "0")),
        cross_chain_beneficiary=os.getenv("SCOUT_CROSS_CHAIN_BENEFICIARY", "").strip(),
        kite_chain_id=kite_chain,
        kite_rpc_url=os.getenv("KITE_RPC_URL", "").strip(),
    )

    opportunity = RankedOpportunity(
        src_chain=args.src_chain,
        dst_chain=args.dst_chain,
        src_protocol=args.src_protocol,
        dst_protocol=args.dst_protocol,
        current_apy=Decimal("0.05"),
        target_apy=Decimal("0.06"),
        net_delta_apy=Decimal("0.01"),
        suggested_amount=args.amount,
        annualized_bridge_cost_apy=Decimal("0"),
    )
    return builder, opportunity


def main() -> None:
    _load_dotenv()

    parser = argparse.ArgumentParser(description="Smoke-test executor vault.execute → OApp path.")
    parser.add_argument("--src-chain", type=int, default=2368, help="Source chain id (default Kite testnet).")
    parser.add_argument("--dst-chain", type=int, default=11155111, help="Destination Hyperlane domain / stub chain.")
    parser.add_argument(
        "--src-protocol",
        choices=["aave-v3", "compound-v3", "morpho", "uniswap-v3"],
        default="morpho",
    )
    parser.add_argument(
        "--dst-protocol",
        choices=["aave-v3", "compound-v3", "morpho", "uniswap-v3"],
        default="morpho",
    )
    parser.add_argument("--amount", type=int, default=10_000, help="Suggested amount / amountForRule (raw units).")
    parser.add_argument(
        "--broadcast",
        action="store_true",
        help="Send the transaction (default is estimateGas only).",
    )
    args = parser.parse_args()

    builder, opportunity = _build_intent(args)
    intent = builder.build(opportunity)
    if intent is None:
        raise SystemExit(
            "ExecutionIntentBuilder returned None (check protocol map covers src/dst pair, "
            "HYP_TRUSTED_REMOTES includes dst_chain, and CLIENT_AGENT_VAULT_ADDRESS / ORCA_OAPP_ADDRESS are set)."
        )

    print("vault:", intent.vault_address)
    print("target (OApp):", intent.target_address)
    print("route:", f"{opportunity.src_chain}:{opportunity.src_protocol} -> {opportunity.dst_chain}:{opportunity.dst_protocol}")
    print("suggested_amount / amount_for_rule:", opportunity.suggested_amount)

    rpc = os.getenv("KITE_RPC_URL", "").strip()
    if not rpc:
        raise SystemExit("KITE_RPC_URL is required.")
    pk = os.getenv("EXECUTOR_PRIVATE_KEY", "").strip()
    if not pk:
        raise SystemExit("EXECUTOR_PRIVATE_KEY is required.")

    chain_id = int(os.getenv("KITE_CHAIN_ID", "0"))
    if chain_id <= 0:
        raise SystemExit("KITE_CHAIN_ID must be set.")

    if args.broadcast:
        try:
            txh = submit_vault_execute_intent(rpc_url=rpc, chain_id=chain_id, private_key=pk, intent=intent)
        except ContractCustomError as exc:
            print("submit reverted:", exc)
            print(
                "Hints: (1) From contracts/: `pnpm oapp:diagnose` and `pnpm enforcer:diagnose`.\n"
                "       (2) Old vault bytecode may surface only ExecutionFailed (0xacfdb444).\n"
                "       (3) Ensure EXECUTOR_PRIVATE_KEY matches vault.executor on Kite."
            )
            raise SystemExit(1) from exc
        print("broadcast tx hash:", txh)
        return

    try:
        gas = estimate_vault_execute_intent_gas(rpc_url=rpc, chain_id=chain_id, private_key=pk, intent=intent)
    except ContractCustomError as exc:
        print("estimateGas reverted:", exc)
        print(
            "Hints: (1) From contracts/: `pnpm oapp:diagnose` and `pnpm enforcer:diagnose`.\n"
            "       (2) Vault bytecode may still mask inner errors (ExecutionFailed 0xacfdb444); "
            "a bubbling ClientAgentVault shows the real OApp/mailbox revert after redeploy.\n"
            "       (3) Ensure EXECUTOR_PRIVATE_KEY matches vault.executor on Kite."
        )
        raise SystemExit(1) from exc

    print("estimateGas OK:", gas)
    print("You can proceed: the same path the executor uses would succeed at gas estimation (broadcast not attempted).")


if __name__ == "__main__":
    main()
