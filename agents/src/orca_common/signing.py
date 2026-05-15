from __future__ import annotations

import time
from typing import Any

from eth_account import Account
from eth_account.messages import encode_typed_data


class DIDMessageSigner:
    def __init__(
        self,
        did: str,
        private_key: str,
        chain_id: int,
        domain_name: str,
        domain_version: str,
    ) -> None:
        self._did = did
        self._chain_id = chain_id
        self._domain_name = domain_name
        self._domain_version = domain_version
        self._account = Account.from_key(private_key)

    def sign_instruction(
        self,
        instruction_id: str,
        signal_id: str,
        executor_did: str,
        approved: bool,
        reason: str,
    ) -> tuple[str, int]:
        timestamp = int(time.time())
        payload = {
            "instructionId": instruction_id,
            "signalId": signal_id,
            "riskDid": self._did,
            "executorDid": executor_did,
            "approved": approved,
            "reason": reason,
            "timestamp": timestamp,
        }
        message = encode_typed_data(full_message=self._typed_data(payload))
        signature = Account.sign_message(message, self._account.key).signature.hex()
        return signature, timestamp

    def _typed_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                ],
                "ExecutionInstruction": [
                    {"name": "instructionId", "type": "string"},
                    {"name": "signalId", "type": "string"},
                    {"name": "riskDid", "type": "string"},
                    {"name": "executorDid", "type": "string"},
                    {"name": "approved", "type": "bool"},
                    {"name": "reason", "type": "string"},
                    {"name": "timestamp", "type": "uint256"},
                ],
            },
            "primaryType": "ExecutionInstruction",
            "domain": {
                "name": self._domain_name,
                "version": self._domain_version,
                "chainId": self._chain_id,
            },
            "message": payload,
        }
