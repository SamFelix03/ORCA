from __future__ import annotations

from web3 import Web3

_REGISTRY_ABI = [
    {
        "inputs": [{"internalType": "bytes32", "name": "did", "type": "bytes32"}],
        "name": "isActiveAgent",
        "outputs": [{"internalType": "bool", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "did", "type": "bytes32"}],
        "name": "getVaultForAgent",
        "outputs": [{"internalType": "address", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]


class OrcaRegistryReader:
    """Minimal ORCARegistry reader for `isActiveAgent(bytes32)` (DID hash = keccak256(utf8(did)))."""

    def __init__(self, rpc_url: str, registry_address: str) -> None:
        self._w3 = Web3(Web3.HTTPProvider(rpc_url.strip()))
        checksum = Web3.to_checksum_address(registry_address.strip())
        self._contract = self._w3.eth.contract(address=checksum, abi=_REGISTRY_ABI)

    def is_active_agent_for_did_string(self, did: str) -> bool:
        did_hash = Web3.keccak(text=did.strip())
        return bool(self._contract.functions.isActiveAgent(did_hash).call())

    def get_vault_for_did_string(self, did: str) -> str | None:
        did_hash = Web3.keccak(text=did.strip())
        vault = self._contract.functions.getVaultForAgent(did_hash).call()
        if not vault or str(vault).lower() == "0x" + "0" * 40:
            return None
        return Web3.to_checksum_address(vault)
