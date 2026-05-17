"""HTTP JSON-RPC Web3 helpers (Kite POA + reliable reachability checks)."""

from __future__ import annotations

from web3 import Web3

# Chain IDs where eth_getBlock extraData triggers web3 ExtraDataLengthError without POA middleware.
_POA_CHAIN_IDS = frozenset({2368})


def web3_for_http_rpc(rpc_url: str, *, chain_id: int | None = None) -> Web3:
    """
    Build a Web3 HTTP client and verify the endpoint responds.

    web3.py's `is_connected()` is unreliable on many public RPCs; we use `eth_blockNumber` instead.
    """
    url = rpc_url.strip()
    if not url.startswith("http"):
        raise ValueError(f"RPC URL must be http(s): {url!r}")

    w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 45}))
    if chain_id in _POA_CHAIN_IDS:
        try:
            from web3.middleware import ExtraDataToPOAMiddleware

            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except Exception:
            pass

    try:
        w3.eth.block_number
    except Exception as exc:
        label = f"chainId={chain_id} " if chain_id is not None else ""
        raise RuntimeError(f"RPC unreachable ({label}url={url!r}): {exc}") from exc
    return w3


def web3_for_kite(rpc_url: str) -> Web3:
    return web3_for_http_rpc(rpc_url, chain_id=2368)
