from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from web3 import Web3

from orca_common.tx_sender import send_with_nonce_retry
from orca_common.web3_rpc import web3_for_http_rpc

CHAIN_ID_TO_HYP_DEST: dict[int, str] = {
    11155111: "sepolia",
    421614: "arbitrumsepolia",
    11155420: "optimismsepolia",
    84532: "basesepolia",
}

_ERC20_ABI = [
    {
        "name": "allowance",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "name": "approve",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "name": "balanceOf",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

_MAX_UINT256 = 2**256 - 1

_OAPP_REBALANCE_ABI = [
    {
        "type": "function",
        "name": "executeCrossChainRebalance",
        "stateMutability": "payable",
        "inputs": [
            {"name": "dstDomain", "type": "uint32"},
            {"name": "destinationAdapter", "type": "bytes32"},
            {"name": "fromProtocol", "type": "address"},
            {"name": "toProtocol", "type": "address"},
            {"name": "beneficiary", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "hookMetadata", "type": "bytes"},
        ],
        "outputs": [],
    }
]


def parse_chain_rpc_map(raw: str) -> dict[int, str]:
    out: dict[int, str] = {}
    if not raw.strip():
        return out
    for entry in raw.split(","):
        item = entry.strip()
        if not item:
            continue
        m = re.match(r"^(\d+):(.+)$", item)
        if not m:
            raise ValueError(
                f"Invalid chain RPC map item {item!r}. Expected 'chainId:https://…' (URL after domain id)."
            )
        chain_raw, url = m.group(1), m.group(2).strip()
        if not url.startswith("http"):
            raise ValueError(f"Invalid RPC URL in map item {item!r}")
        out[int(chain_raw)] = url
    return out


def resolve_collateral_manifest_path(raw: str) -> Path:
    p = Path(raw).expanduser()
    if p.is_file():
        return p.resolve()
    for base in (Path.cwd(), Path.cwd().parent):
        cand = (base / raw).expanduser().resolve()
        if cand.is_file():
            return cand
    raise FileNotFoundError(f"Collateral manifest not found: {raw}")


def load_collateral_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def decode_cross_chain_beneficiary(oapp_calldata: str) -> str | None:
    """Decode beneficiary from ORCAOApp.executeCrossChainRebalance calldata."""
    raw = oapp_calldata.strip()
    if not raw or raw.lower() in ("0x", "0x0"):
        return None
    w3 = Web3()
    contract = w3.eth.contract(abi=_OAPP_REBALANCE_ABI)
    try:
        _fn, args = contract.decode_function_input(raw)
    except Exception:
        return None
    if isinstance(args, (list, tuple)):
        if len(args) < 5:
            return None
        beneficiary = args[4]
    elif isinstance(args, dict):
        beneficiary = args.get("beneficiary")
    else:
        return None
    if not beneficiary:
        return None
    return Web3.to_checksum_address(str(beneficiary))


def resolve_spoke_beneficiary(
    *,
    oapp_calldata: str,
    config_beneficiary: str,
    signer_address: str,
) -> str:
    """Beneficiary RemoteAdapter pulls from on delivery (must match allowance owner)."""
    decoded = decode_cross_chain_beneficiary(oapp_calldata)
    if decoded:
        return decoded
    configured = config_beneficiary.strip()
    if configured:
        return Web3.to_checksum_address(configured)
    return Web3.to_checksum_address(signer_address)


def assert_spoke_beneficiary_can_approve(
    *,
    beneficiary: str,
    signer_address: str,
    vault_address: str | None,
    logger: logging.Logger,
) -> None:
    """RemoteAdapter.transferFrom(beneficiary, …) requires beneficiary to have approved the adapter."""
    if beneficiary.lower() == signer_address.lower():
        return
    if vault_address and beneficiary.lower() == vault_address.lower():
        raise RuntimeError(
            "Cross-chain beneficiary is ClientAgentVault, but the vault cannot hold Sepolia USDT or "
            "approve RemoteAdapter on a spoke. Set SCOUT_CROSS_CHAIN_BENEFICIARY to the executor EOA "
            f"({signer_address}) in agents/.env for both Scout and Executor, then re-run Scout so "
            "new signals encode the EOA as beneficiary. Run: cd contracts && pnpm prepare:sepolia-e2e"
        )
    raise RuntimeError(
        f"Cross-chain beneficiary {beneficiary} does not match executor signer {signer_address}. "
        "Set SCOUT_CROSS_CHAIN_BENEFICIARY to the executor EOA in agents/.env or align intent encoding."
    )


def spoke_collateral_and_adapter(manifest: dict[str, Any], chain_id: int) -> tuple[str, str]:
    tokens = manifest.get("collateralTokenByChainId")
    adapters = manifest.get("remoteAdapterByChainId")
    if not isinstance(tokens, dict) or not isinstance(adapters, dict):
        raise ValueError("Manifest must include collateralTokenByChainId and remoteAdapterByChainId")
    key = str(chain_id)
    if key not in tokens or key not in adapters:
        raise KeyError(f"chainId {chain_id} missing from collateral/adapter manifest tables")
    return str(tokens[key]).strip(), str(adapters[key]).strip()


def ensure_erc20_allowance(
    *,
    rpc_url: str,
    chain_id: int,
    private_key: str,
    token: str,
    spender: str,
    min_amount: int,
    logger: logging.Logger,
    owner: str | None = None,
) -> str | None:
    """Broadcast approve(2**256-1) if allowance < min_amount. Returns tx hash or None if already sufficient."""
    w3 = web3_for_http_rpc(rpc_url, chain_id=chain_id)

    signer = w3.eth.account.from_key(private_key)
    owner_addr = Web3.to_checksum_address(owner or signer.address)
    if owner_addr.lower() != signer.address.lower():
        raise RuntimeError(
            f"ensure_erc20_allowance: cannot approve for owner={owner_addr} with signer={signer.address}"
        )
    owner = owner_addr
    token_c = Web3.to_checksum_address(token)
    spender_c = Web3.to_checksum_address(spender)
    c = w3.eth.contract(address=token_c, abi=_ERC20_ABI)
    balance = int(c.functions.balanceOf(owner).call())
    current = int(c.functions.allowance(owner, spender_c).call())
    if balance < min_amount:
        logger.warning(
            "Executor: spoke beneficiary %s balance=%s on token=%s (need>=%s). "
            "Bridge collateral: cd contracts && pnpm prepare:sepolia-e2e",
            owner,
            balance,
            token_c,
            min_amount,
        )
    if current >= min_amount:
        logger.info(
            "Executor: spoke ERC20 allowance OK owner=%s spender=%s current=%s need=%s balance=%s",
            owner,
            spender_c,
            current,
            min_amount,
            balance,
        )
        return None

    logger.info(
        "Executor: approving RemoteAdapter on spoke token=%s spender=%s",
        token_c,
        spender_c,
    )
    def _build_tx(nonce: int) -> dict:
        return c.functions.approve(spender_c, _MAX_UINT256).build_transaction(
            {
                "from": owner,
                "chainId": chain_id,
                "nonce": nonce,
                "maxFeePerGas": w3.to_wei("2", "gwei"),
                "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
            }
        )

    tx_hash, receipt = send_with_nonce_retry(
        w3=w3,
        signer=signer,
        build_tx=_build_tx,
        estimate_gas_if_missing=True,
        wait_for_receipt=True,
    )
    if receipt is None:
        hx = tx_hash
    else:
        h = receipt["transactionHash"]
        hx = h.hex() if hasattr(h, "hex") else str(h)
    logger.info("Executor: approve tx hash=%s", hx)
    return hx


def run_hub_to_dest_bridge(
    *,
    contracts_dir: Path,
    hyp_dest: str,
    amount: int,
    recipient: str,
    snapshot_path: str,
    warp_asset: str,
    logger: logging.Logger,
) -> dict[str, Any] | None:
    root = contracts_dir.resolve()
    script = root / "scripts" / "hyperlane" / "transfer-hub-to-dest.ts"
    if not script.is_file():
        raise FileNotFoundError(f"Missing Hardhat script: {script}")

    env = os.environ.copy()
    env["HYP_DEST"] = hyp_dest
    env["AMOUNT"] = str(int(amount))
    env["RECIPIENT"] = recipient
    env["HYP_WARP_ASSET"] = warp_asset
    snap = snapshot_path.strip()
    if snap:
        env["HYPERLANE_INTEGRATION_SNAPSHOT"] = str(Path(snap).expanduser().resolve())

    rel_script = script.relative_to(root)
    cmd = ["npx", "hardhat", "run", str(rel_script), "--network", "kiteTestnet"]
    logger.info(
        "Executor: bridging hub→spoke via Hardhat cwd=%s HYP_DEST=%s AMOUNT=%s RECIPIENT=%s HYP_WARP_ASSET=%s",
        root,
        hyp_dest,
        amount,
        recipient,
        warp_asset,
    )
    result = subprocess.run(cmd, cwd=str(root), env=env, check=True, capture_output=True, text=True)
    if result.stdout:
        for line in result.stdout.splitlines():
            logger.info("Executor bridge stdout: %s", line)
    if result.stderr:
        for line in result.stderr.splitlines():
            logger.warning("Executor bridge stderr: %s", line)

    match = re.search(r"\{[\s\S]*\}", result.stdout or "")
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
