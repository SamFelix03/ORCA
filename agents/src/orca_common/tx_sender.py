from __future__ import annotations

import time
from typing import Any, Callable

from web3 import Web3
from web3.types import TxParams


def _error_text(exc: Exception) -> str:
    return str(exc).lower()


def _is_nonce_race_error(message: str) -> bool:
    patterns = (
        "nonce too low",
        "nonce too high",
        "transaction nonce is too low",
        "replacement fee too low",
        "already known",
        "already imported",
        "replacement transaction underpriced",
        "could not replace existing tx",
    )
    return any(p in message for p in patterns)


def _next_backoff(attempt: int, base_delay: float, max_delay: float) -> float:
    return min(max_delay, base_delay * (2 ** max(0, attempt - 1)))


def send_with_nonce_retry(
    *,
    w3: Web3,
    signer: Any,
    build_tx: Callable[[int], TxParams | dict[str, Any]],
    estimate_gas_if_missing: bool,
    wait_for_receipt: bool,
    max_attempts: int = 8,
    receipt_timeout: int = 180,
    base_delay: float = 0.2,
    max_delay: float = 2.0,
) -> tuple[str, Any | None]:
    """
    Send a signed transaction with robust nonce-race recovery.

    This guards against concurrent writers sharing one EOA across processes.
    On nonce-related RPC errors we refresh pending nonce and retry.
    """
    if max_attempts < 1:
        raise ValueError("max_attempts must be >= 1")

    address = signer.address
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        nonce = int(w3.eth.get_transaction_count(address, "pending"))
        tx = dict(build_tx(nonce))
        if estimate_gas_if_missing and "gas" not in tx:
            tx["gas"] = int(w3.eth.estimate_gas(tx))

        signed = signer.sign_transaction(tx)
        local_hash = Web3.keccak(signed.raw_transaction).hex()

        try:
            sent = w3.eth.send_raw_transaction(signed.raw_transaction)
            tx_hash = sent.hex() if hasattr(sent, "hex") else str(sent)
            if not tx_hash.startswith("0x"):
                tx_hash = local_hash
            if wait_for_receipt:
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=receipt_timeout)
                return tx_hash, receipt
            return tx_hash, None
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            msg = _error_text(exc)

            # If tx is already in mempool, treat as accepted.
            if "already known" in msg or "already imported" in msg:
                if wait_for_receipt:
                    receipt = w3.eth.wait_for_transaction_receipt(local_hash, timeout=receipt_timeout)
                    return local_hash, receipt
                return local_hash, None

            if _is_nonce_race_error(msg) and attempt < max_attempts:
                time.sleep(_next_backoff(attempt, base_delay, max_delay))
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("send_with_nonce_retry exhausted without exception")
