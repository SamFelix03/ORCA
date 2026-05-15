from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal, InvalidOperation

from web3 import Web3


USDC_MINT_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Mint Kite testnet USDC via mint(address,uint256).",
    )
    parser.add_argument(
        "--to",
        default="0xAbf5484297F55BFc9d3b8A202280f89507CA845b",
        help="Recipient address (default: requested address).",
    )
    parser.add_argument(
        "--amount-usdc",
        required=True,
        help="Human-readable USDC amount (e.g. 1000 or 12.5).",
    )
    parser.add_argument(
        "--rpc-url",
        default=os.getenv("KITE_RPC_URL", "https://rpc-testnet.gokite.ai"),
        help="RPC URL (default env KITE_RPC_URL or Kite testnet RPC).",
    )
    parser.add_argument(
        "--token",
        default="0x0309764915AFC7a2a7CDd1E64c58a57c1F1705E3",
        help="USDC token contract address on Kite testnet.",
    )
    parser.add_argument(
        "--private-key",
        default=os.getenv("USDC_MINTER_PRIVATE_KEY", ""),
        help="Minter private key (or set USDC_MINTER_PRIVATE_KEY env var).",
    )
    parser.add_argument(
        "--gas",
        type=int,
        default=150000,
        help="Gas limit (default: 150000).",
    )
    parser.add_argument(
        "--max-fee-gwei",
        type=Decimal,
        default=Decimal("2"),
        help="EIP-1559 maxFeePerGas in gwei (default: 2).",
    )
    parser.add_argument(
        "--max-priority-fee-gwei",
        type=Decimal,
        default=Decimal("1"),
        help="EIP-1559 maxPriorityFeePerGas in gwei (default: 1).",
    )
    return parser.parse_args()


def _to_usdc_base_units(amount_usdc: str) -> int:
    try:
        value = Decimal(amount_usdc)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid --amount-usdc value: {amount_usdc}") from exc
    if value <= 0:
        raise ValueError("--amount-usdc must be > 0")
    scaled = value * Decimal(10**6)
    if scaled != scaled.to_integral_value():
        raise ValueError("--amount-usdc supports up to 6 decimals")
    return int(scaled)


def main() -> int:
    args = _parse_args()
    if not args.private_key:
        print("Missing private key. Provide --private-key or USDC_MINTER_PRIVATE_KEY.", file=sys.stderr)
        return 1

    w3 = Web3(Web3.HTTPProvider(args.rpc_url))
    if not w3.is_connected():
        print(f"RPC not reachable: {args.rpc_url}", file=sys.stderr)
        return 1

    if not Web3.is_address(args.to):
        print(f"Invalid recipient address: {args.to}", file=sys.stderr)
        return 1
    if not Web3.is_address(args.token):
        print(f"Invalid token address: {args.token}", file=sys.stderr)
        return 1

    recipient = Web3.to_checksum_address(args.to)
    token = Web3.to_checksum_address(args.token)
    amount_raw = _to_usdc_base_units(args.amount_usdc)

    account = w3.eth.account.from_key(args.private_key)
    nonce = w3.eth.get_transaction_count(account.address)
    chain_id = w3.eth.chain_id

    contract = w3.eth.contract(address=token, abi=USDC_MINT_ABI)
    tx = contract.functions.mint(recipient, amount_raw).build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "chainId": chain_id,
            "gas": args.gas,
            "maxFeePerGas": w3.to_wei(args.max_fee_gwei, "gwei"),
            "maxPriorityFeePerGas": w3.to_wei(args.max_priority_fee_gwei, "gwei"),
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    print("mint_success")
    print(f"token={token}")
    print(f"to={recipient}")
    print(f"amount_usdc={args.amount_usdc}")
    print(f"amount_raw={amount_raw}")
    print(f"from={account.address}")
    print(f"tx_hash={tx_hash.hex()}")
    print(f"status={receipt.status}")
    return 0 if receipt.status == 1 else 1


if __name__ == "__main__":
    raise SystemExit(main())
