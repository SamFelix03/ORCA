from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from web3 import Web3

CHAIN_ID_TO_HYP_DEST: dict[int, str] = {
    11155111: "sepolia",
    421614: "arbitrumsepolia",
    11155420: "optimismsepolia",
    84532: "basesepolia",
}

_ERC20_ALLOWANCE_ABI = [
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
]

_MAX_UINT256 = 2**256 - 1


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
) -> str | None:
    """Broadcast approve(2**256-1) if allowance < min_amount. Returns tx hash or None if already sufficient."""
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError("ensure_erc20_allowance: Web3 provider not connected")

    signer = w3.eth.account.from_key(private_key)
    owner = signer.address
    token_c = Web3.to_checksum_address(token)
    spender_c = Web3.to_checksum_address(spender)
    c = w3.eth.contract(address=token_c, abi=_ERC20_ALLOWANCE_ABI)
    current = int(c.functions.allowance(owner, spender_c).call())
    if current >= min_amount:
        logger.info(
            "Executor: spoke ERC20 allowance OK owner=%s spender=%s current=%s need=%s",
            owner,
            spender_c,
            current,
            min_amount,
        )
        return None

    logger.info(
        "Executor: approving RemoteAdapter on spoke token=%s spender=%s",
        token_c,
        spender_c,
    )
    tx: dict = {
        "from": owner,
        "chainId": chain_id,
        "nonce": w3.eth.get_transaction_count(owner, "pending"),
        "maxFeePerGas": w3.to_wei("2", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
    }
    built = c.functions.approve(spender_c, _MAX_UINT256).build_transaction(tx)
    built["gas"] = int(w3.eth.estimate_gas(built))
    signed = signer.sign_transaction(built)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
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
) -> None:
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
    subprocess.run(cmd, cwd=str(root), env=env, check=True)
