from __future__ import annotations

import time
import uuid
from decimal import Decimal
from typing import Any

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from orca_scout.models import ExecutionIntent, RankedOpportunity, YieldSignal


class PassportSigner:
    def __init__(
        self,
        scout_did: str,
        private_key: str,
        chain_id: int,
        domain_name: str,
        domain_version: str,
    ) -> None:
        self._scout_did = scout_did
        self._chain_id = chain_id
        self._domain_name = domain_name
        self._domain_version = domain_version
        self._account = Account.from_key(private_key)

    def sign_opportunity(self, opportunity: RankedOpportunity, execution_intent: ExecutionIntent | None = None) -> YieldSignal:
        signal_id = str(uuid.uuid4())
        timestamp = int(time.time())
        payload = {
            "signalId": signal_id,
            "scoutDid": self._scout_did,
            "srcChain": opportunity.src_chain,
            "dstChain": opportunity.dst_chain,
            "srcProtocol": opportunity.src_protocol,
            "dstProtocol": opportunity.dst_protocol,
            "currentApy": self._decimal_to_wad(opportunity.current_apy),
            "targetApy": self._decimal_to_wad(opportunity.target_apy),
            "netDeltaApy": self._decimal_to_wad(opportunity.net_delta_apy),
            "suggestedAmount": opportunity.suggested_amount,
            "timestamp": timestamp,
        }

        signable = encode_typed_data(full_message=self._typed_data(payload))
        signature = Account.sign_message(signable, self._account.key).signature.hex()

        return YieldSignal(
            signal_id=signal_id,
            scout_did=self._scout_did,
            src_chain=opportunity.src_chain,
            dst_chain=opportunity.dst_chain,
            src_protocol=opportunity.src_protocol,
            dst_protocol=opportunity.dst_protocol,
            current_apy=opportunity.current_apy,
            target_apy=opportunity.target_apy,
            net_delta_apy=opportunity.net_delta_apy,
            suggested_amount=opportunity.suggested_amount,
            signature=signature,
            timestamp=timestamp,
            execution_intent=execution_intent,
        )

    def did_hash(self) -> bytes:
        return Web3.keccak(text=self._scout_did)

    def _typed_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                ],
                "YieldSignal": [
                    {"name": "signalId", "type": "string"},
                    {"name": "scoutDid", "type": "string"},
                    {"name": "srcChain", "type": "uint256"},
                    {"name": "dstChain", "type": "uint256"},
                    {"name": "srcProtocol", "type": "string"},
                    {"name": "dstProtocol", "type": "string"},
                    {"name": "currentApy", "type": "uint256"},
                    {"name": "targetApy", "type": "uint256"},
                    {"name": "netDeltaApy", "type": "uint256"},
                    {"name": "suggestedAmount", "type": "uint256"},
                    {"name": "timestamp", "type": "uint256"},
                ],
            },
            "primaryType": "YieldSignal",
            "domain": {
                "name": self._domain_name,
                "version": self._domain_version,
                "chainId": self._chain_id,
            },
            "message": payload,
        }

    @staticmethod
    def _decimal_to_wad(value: Decimal) -> int:
        return int((value * Decimal(10**18)).to_integral_value())
