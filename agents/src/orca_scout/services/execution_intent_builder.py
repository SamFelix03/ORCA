from __future__ import annotations

import re

from web3 import Web3
from orca_scout.models import ExecutionIntent, RankedOpportunity


class ExecutionIntentBuilder:
    def __init__(
        self,
        enabled: bool,
        client_agent_vault_address: str,
        orca_oapp_address: str,
        protocol_map_raw: str,
        trusted_remotes_raw: str,
        hook_metadata_hex: str,
        tx_value_wei: int,
        cross_chain_beneficiary: str,
        kite_chain_id: int,
    ) -> None:
        self._enabled = enabled
        self._kite_chain_id = kite_chain_id
        self._vault_address = self._normalize_address(client_agent_vault_address, "CLIENT_AGENT_VAULT_ADDRESS")
        self._oapp_address = self._normalize_address(orca_oapp_address, "ORCA_OAPP_ADDRESS")
        self._protocol_map = self._parse_protocol_map(protocol_map_raw)
        self._trusted_remotes = self._parse_domain_map(trusted_remotes_raw.strip())
        self._hook_metadata_hex = self._normalize_hex_bytes(hook_metadata_hex or "0x", "SCOUT_EXECUTION_HOOK_METADATA_HEX")
        self._tx_value_wei = tx_value_wei
        if cross_chain_beneficiary.strip():
            self._beneficiary = self._normalize_address(cross_chain_beneficiary, "SCOUT_CROSS_CHAIN_BENEFICIARY")
        else:
            self._beneficiary = self._vault_address
        self._w3 = Web3()

        self._oapp_contract = self._w3.eth.contract(
            address=self._oapp_address if self._oapp_address else Web3.to_checksum_address("0x0000000000000000000000000000000000000001"),
            abi=[
                {
                    "type": "function",
                    "name": "executeCrossChainRebalance",
                    "stateMutability": "nonpayable",
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
            ],
        )
        self._vault_contract = self._w3.eth.contract(
            address=self._vault_address if self._vault_address else Web3.to_checksum_address("0x0000000000000000000000000000000000000001"),
            abi=[
                {
                    "type": "function",
                    "name": "execute",
                    "stateMutability": "nonpayable",
                    "inputs": [
                        {"name": "target", "type": "address"},
                        {"name": "value", "type": "uint256"},
                        {"name": "data", "type": "bytes"},
                        {"name": "amountForRule", "type": "uint256"},
                    ],
                    "outputs": [{"name": "result", "type": "bytes"}],
                }
            ],
        )

        self._deposit_abi_contract = self._w3.eth.contract(
            abi=[
                {
                    "name": "deposit",
                    "inputs": [{"type": "uint256", "name": "amount"}],
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ],
        )

    def build(self, opportunity: RankedOpportunity) -> ExecutionIntent | None:
        if not self._enabled:
            return None
        if not self._vault_address or not self._oapp_address:
            return None

        src_key = f"{opportunity.src_chain}:{opportunity.src_protocol}"
        dst_key = f"{opportunity.dst_chain}:{opportunity.dst_protocol}"
        from_protocol = self._protocol_map.get(src_key)
        to_protocol = self._protocol_map.get(dst_key)
        if not from_protocol or not to_protocol:
            return None

        zero_b32 = "0x" + "00" * 32

        if opportunity.dst_chain == self._kite_chain_id:
            stub_addr = ExecutionIntentBuilder._normalize_address(to_protocol, "Kite stub (to_protocol)")
            kite_calldata = self._deposit_abi_contract.encode_abi("deposit", [opportunity.suggested_amount])
            return ExecutionIntent(
                vault_address=self._vault_address,
                target_address=self._oapp_address,
                tx_value_wei=self._tx_value_wei,
                amount_for_rule=opportunity.suggested_amount,
                from_protocol=from_protocol,
                to_protocol=to_protocol,
                destination_domain=opportunity.dst_chain,
                destination_adapter=zero_b32,
                oapp_calldata="0x",
                vault_execute_calldata="0x",
                kite_stub_address=stub_addr,
                kite_stub_calldata=kite_calldata,
            )

        destination_adapter = self._trusted_remotes.get(opportunity.dst_chain)
        if not destination_adapter:
            return None

        oapp_calldata = self._oapp_contract.encode_abi(
            "executeCrossChainRebalance",
            args=[
                opportunity.dst_chain,
                destination_adapter,
                from_protocol,
                to_protocol,
                self._beneficiary,
                opportunity.suggested_amount,
                bytes.fromhex(self._hook_metadata_hex[2:]),
            ],
        )
        vault_calldata = self._vault_contract.encode_abi(
            "execute",
            args=[
                self._oapp_address,
                self._tx_value_wei,
                bytes.fromhex(oapp_calldata[2:]),
                opportunity.suggested_amount,
            ],
        )

        return ExecutionIntent(
            vault_address=self._vault_address,
            target_address=self._oapp_address,
            tx_value_wei=self._tx_value_wei,
            amount_for_rule=opportunity.suggested_amount,
            from_protocol=from_protocol,
            to_protocol=to_protocol,
            destination_domain=opportunity.dst_chain,
            destination_adapter=destination_adapter,
            oapp_calldata=oapp_calldata,
            vault_execute_calldata=vault_calldata,
        )

    @staticmethod
    def _parse_protocol_map(raw: str) -> dict[str, str]:
        mapping: dict[str, str] = {}
        if not raw:
            return mapping
        for item in raw.split(","):
            entry = item.strip()
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) != 3:
                raise ValueError(
                    f"Invalid SCOUT_PROTOCOL_ADDRESS_MAP item '{entry}'. Expected 'chainId:protocol:0x...'"
                )
            chain, protocol, address = [part.strip() for part in parts]
            key = f"{int(chain)}:{protocol}"
            mapping[key] = ExecutionIntentBuilder._normalize_address(address, f"SCOUT_PROTOCOL_ADDRESS_MAP[{entry}]")
        return mapping

    @staticmethod
    def _parse_domain_map(raw: str) -> dict[int, str]:
        mapping: dict[int, str] = {}
        if not raw:
            return mapping
        for item in raw.split(","):
            entry = item.strip()
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) != 2:
                raise ValueError(f"Invalid HYP_TRUSTED_REMOTES item '{entry}'. Expected 'domain:0x...bytes32'")
            domain_raw, remote_raw = [part.strip() for part in parts]
            if not domain_raw.isdigit():
                raise ValueError(f"Invalid domain in HYP_TRUSTED_REMOTES item '{entry}'")
            normalized = ExecutionIntentBuilder._normalize_bytes32(remote_raw, f"HYP_TRUSTED_REMOTES[{entry}]")
            mapping[int(domain_raw)] = normalized
        return mapping

    @staticmethod
    def _normalize_address(value: str, field_name: str) -> str:
        value = value.strip()
        if not value:
            return ""
        if not Web3.is_address(value):
            raise ValueError(f"{field_name} must be a valid EVM address")
        return Web3.to_checksum_address(value)

    @staticmethod
    def _normalize_bytes32(value: str, field_name: str) -> str:
        value = value.strip()
        if Web3.is_address(value):
            raw = bytes.fromhex(value[2:])
            padded = (b"\x00" * (32 - len(raw))) + raw
            return "0x" + padded.hex()
        if not re.fullmatch(r"0x[a-fA-F0-9]{64}", value):
            raise ValueError(f"{field_name} must be bytes32 hex or EVM address")
        return value.lower()

    @staticmethod
    def _normalize_hex_bytes(value: str, field_name: str) -> str:
        value = value.strip()
        if not value.startswith("0x"):
            raise ValueError(f"{field_name} must start with 0x")
        if len(value) % 2 != 0:
            raise ValueError(f"{field_name} must contain even-length hex bytes")
        if not re.fullmatch(r"0x[a-fA-F0-9]*", value):
            raise ValueError(f"{field_name} must be valid hex")
        return value.lower()
