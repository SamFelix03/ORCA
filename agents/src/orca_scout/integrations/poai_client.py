from __future__ import annotations

import os

from web3 import Web3
from web3.contract import Contract

from orca_scout.models import ActionType, PoAIRecord


def _gwei_from_env(raw: str, name: str) -> int:
    try:
        gwei = float(str(raw).strip())
    except ValueError as exc:
        raise ValueError(f"{name} must be a number (gwei)") from exc
    if gwei <= 0:
        raise ValueError(f"{name} must be positive")
    return Web3.to_wei(gwei, "gwei")


POAI_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "epochId", "type": "uint256"},
            {
                "components": [
                    {"internalType": "bytes32", "name": "agentDID", "type": "bytes32"},
                    {"internalType": "uint8", "name": "actionType", "type": "uint8"},
                    {"internalType": "bytes32", "name": "inputHash", "type": "bytes32"},
                    {"internalType": "bytes32", "name": "outcomeHash", "type": "bytes32"},
                    {"internalType": "int256", "name": "valueDelta", "type": "int256"},
                    {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                ],
                "internalType": "struct PoAIAttribution.AttributionRecord",
                "name": "record",
                "type": "tuple",
            },
        ],
        "name": "recordAction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


class PoAIClient:
    def __init__(self, rpc_url: str, chain_id: int, contract_address: str, signer_private_key: str) -> None:
        self._w3 = Web3(Web3.HTTPProvider(rpc_url))
        self._chain_id = chain_id
        self._signer = self._w3.eth.account.from_key(signer_private_key)
        self._dry_run = (os.getenv("POAI_DRY_RUN", "false").strip().lower() == "true")
        self._contract: Contract = self._w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=POAI_ABI)

    def record_signal_action(self, epoch_id: int, record: PoAIRecord) -> str:
        if self._dry_run:
            return "0x" + "2" * 64
        # Use pending nonce so back-to-back records (e.g., SIGNAL then RISK_EVAL)
        # don't collide with still-pending txs and trigger replacement errors.
        nonce = self._w3.eth.get_transaction_count(self._signer.address, "pending")
        # Concurrent txs from the same EOA (e.g. all agents sharing one key — not recommended)
        # need fees high enough to replace pending txs; see POAI_MAX_FEE_GWEI / POAI_PRIORITY_FEE_GWEI.
        max_fee = _gwei_from_env(os.getenv("POAI_MAX_FEE_GWEI", "25"), "POAI_MAX_FEE_GWEI")
        priority_fee = _gwei_from_env(os.getenv("POAI_PRIORITY_FEE_GWEI", "2"), "POAI_PRIORITY_FEE_GWEI")

        tx = self._contract.functions.recordAction(
            epoch_id,
            (
                record.agent_did_hash,
                self._action_type_to_uint8(record.action_type),
                record.input_hash,
                record.outcome_hash,
                record.value_delta,
                record.timestamp,
            ),
        ).build_transaction(
            {
                "from": self._signer.address,
                "nonce": nonce,
                "chainId": self._chain_id,
                "gas": 300_000,
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": priority_fee,
            }
        )
        signed = self._signer.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()

    def is_connected(self) -> bool:
        return self._w3.is_connected()

    @staticmethod
    def _action_type_to_uint8(action_type: ActionType) -> int:
        if action_type == ActionType.SIGNAL:
            return 0
        if action_type == ActionType.RISK_EVAL:
            return 1
        if action_type == ActionType.EXECUTION:
            return 2
        return 3
