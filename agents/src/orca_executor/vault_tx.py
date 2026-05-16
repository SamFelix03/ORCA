"""Submit Scout `ExecutionIntent` on-chain (vault path or direct contract call)."""

from __future__ import annotations

from web3 import Web3
from web3.types import TxParams

from orca_common.tx_sender import send_with_nonce_retry
from orca_scout.models import ExecutionIntent


def _build_vault_execute_tx(
    w3: Web3,
    *,
    from_addr: str,
    chain_id: int,
    nonce: int,
    intent: ExecutionIntent,
) -> TxParams:
    vault = Web3.to_checksum_address(intent.vault_address)
    data = intent.vault_execute_calldata.strip()
    if not data.startswith("0x"):
        data = f"0x{data}"
    return TxParams(
        {
            "from": from_addr,
            "to": vault,
            "data": data,
            "value": intent.tx_value_wei,
            "chainId": chain_id,
            "nonce": nonce,
            "maxFeePerGas": w3.to_wei("2", "gwei"),
            "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
        }
    )


def estimate_vault_execute_intent_gas(
    *,
    rpc_url: str,
    chain_id: int,
    private_key: str,
    intent: ExecutionIntent,
) -> int:
    """Same `eth_estimateGas` path as the executor vault broadcast (no transaction sent)."""
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError("Executor vault tx: Web3 provider not connected")
    signer = w3.eth.account.from_key(private_key)
    nonce = w3.eth.get_transaction_count(signer.address, "pending")
    tx = _build_vault_execute_tx(w3, from_addr=signer.address, chain_id=chain_id, nonce=nonce, intent=intent)
    return int(w3.eth.estimate_gas(tx))


def submit_contract_call(
    *,
    rpc_url: str,
    chain_id: int,
    private_key: str,
    to: str,
    data: str,
    value_wei: int = 0,
) -> str:
    """Broadcast a raw contract call. Returns tx hash hex (0x-prefixed)."""
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError("Executor contract tx: Web3 provider not connected")

    signer = w3.eth.account.from_key(private_key)
    target = Web3.to_checksum_address(to)
    calldata = data.strip()
    if not calldata.startswith("0x"):
        calldata = f"0x{calldata}"

    def _build_tx(nonce: int) -> dict:
        return {
            "from": signer.address,
            "to": target,
            "data": calldata,
            "value": value_wei,
            "chainId": chain_id,
            "nonce": nonce,
            "maxFeePerGas": w3.to_wei("2", "gwei"),
            "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
        }

    tx_hash, receipt = send_with_nonce_retry(
        w3=w3,
        signer=signer,
        build_tx=_build_tx,
        estimate_gas_if_missing=True,
        wait_for_receipt=True,
    )
    if receipt is None:
        return tx_hash
    h = receipt["transactionHash"]
    return h.hex() if hasattr(h, "hex") else str(h)


def submit_vault_execute_intent(
    *,
    rpc_url: str,
    chain_id: int,
    private_key: str,
    intent: ExecutionIntent,
) -> str:
    """Return tx hash hex (0x-prefixed)."""
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError("Executor vault tx: Web3 provider not connected")

    signer = w3.eth.account.from_key(private_key)

    def _build_tx(nonce: int) -> dict:
        return dict(_build_vault_execute_tx(w3, from_addr=signer.address, chain_id=chain_id, nonce=nonce, intent=intent))

    tx_hash, receipt = send_with_nonce_retry(
        w3=w3,
        signer=signer,
        build_tx=_build_tx,
        estimate_gas_if_missing=True,
        wait_for_receipt=True,
    )
    if receipt is None:
        return tx_hash
    h = receipt["transactionHash"]
    return h.hex() if hasattr(h, "hex") else str(h)
