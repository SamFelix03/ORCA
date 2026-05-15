from __future__ import annotations

import asyncio
import base64
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

import httpx
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3


EIP3009_ABI = [
    {
        "inputs": [],
        "name": "name",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "version",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
]


@dataclass
class X402Terms:
    accepted: dict[str, Any]
    amount: int
    timeout_seconds: int


class X402DirectExecutor:
    """
    Direct x402 execute utility for internal micropayments.

    This bypasses Passport discovery allowlisting by speaking the x402 flow
    directly with the paid endpoint:
    1. POST without X-Payment -> expect 402 + accepts[]
    2. Build/sign EIP-3009 transferWithAuthorization
    3. POST with X-Payment header (base64 JSON)
    """

    def __init__(
        self,
        *,
        rpc_url: str,
        chain_id: int,
        signer_private_key: str,
        facilitator_address: str,
        token_name_fallback: str,
        token_version_fallback: str,
        timeout_seconds: float,
    ) -> None:
        self._account = Account.from_key(signer_private_key)
        self._rpc_url = rpc_url.strip()
        self._chain_id = chain_id
        self._facilitator_address = Web3.to_checksum_address(facilitator_address)
        self._token_name_fallback = token_name_fallback
        self._token_version_fallback = token_version_fallback
        self._timeout_seconds = timeout_seconds
        self._client = httpx.AsyncClient(timeout=timeout_seconds)
        self._web3 = Web3(Web3.HTTPProvider(self._rpc_url)) if self._rpc_url else None

    async def close(self) -> None:
        await self._client.aclose()

    async def execute(self, *, resource_url: str, payload: dict[str, Any]) -> dict[str, Any]:
        preflight = await self._client.post(resource_url, json=payload, headers={"Content-Type": "application/json"})
        if preflight.status_code != 402:
            detail = _safe_json_or_text(preflight)
            raise RuntimeError(
                f"Direct x402 preflight expected 402, got {preflight.status_code}: {detail}"
            )

        body = _safe_json(preflight)
        terms = self._extract_terms(body)
        network = _coerce_caip_network(terms.accepted.get("network"), self._chain_id)
        asset = str(terms.accepted.get("asset") or "").strip()
        if not asset:
            raise RuntimeError("Direct x402 preflight missing accepts[0].asset")
        pay_to_raw = str(terms.accepted.get("payTo") or "").strip()
        if not pay_to_raw:
            raise RuntimeError("Direct x402 preflight missing accepts[0].payTo")
        pay_to = Web3.to_checksum_address(pay_to_raw)

        accepted_extra = terms.accepted.get("extra")
        token_name, token_version = await self._resolve_token_metadata(
            asset=asset,
            accepted_extra=accepted_extra if isinstance(accepted_extra, dict) else None,
        )
        authorization = self._build_authorization(terms.amount, terms.timeout_seconds, pay_to=pay_to)
        signature = self._sign_authorization(
            authorization=authorization,
            asset=asset,
            chain_id=_coerce_chain_id(network, self._chain_id),
            token_name=token_name,
            token_version=token_version,
        )

        accepted = dict(terms.accepted)
        accepted["network"] = network
        # Ensure `accepted.extra` matches the domain fields actually used for signing.
        accepted["extra"] = {"name": token_name, "version": token_version}
        x_payment_payload = {
            "x402Version": 2,
            "accepted": accepted,
            "payload": {
                "signature": signature,
                "authorization": authorization,
            },
            "resource": {
                "url": resource_url,
                "description": "ORCA direct x402 execute",
                "mimeType": "application/json",
            },
        }
        x_payment_header = base64.b64encode(json.dumps(x_payment_payload).encode("utf-8")).decode("ascii")

        paid = await self._client.post(
            resource_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Payment": x_payment_header,
            },
        )
        if paid.status_code >= 400:
            detail = _safe_json_or_text(paid)
            raise RuntimeError(f"Direct x402 paid call failed with {paid.status_code}: {detail}")
        return _safe_json(paid)

    def _extract_terms(self, challenge: dict[str, Any]) -> X402Terms:
        accepts = challenge.get("accepts")
        if not isinstance(accepts, list) or not accepts:
            raise RuntimeError("Direct x402 preflight missing accepts[]")
        accepted = accepts[0]
        if not isinstance(accepted, dict):
            raise RuntimeError("Direct x402 preflight accepts[0] is not an object")

        amount_raw = accepted.get("amount", accepted.get("maxAmountRequired", "0"))
        try:
            amount = int(str(amount_raw))
        except ValueError as exc:
            raise RuntimeError(f"Direct x402 preflight invalid amount: {amount_raw}") from exc
        timeout_raw = accepted.get("maxTimeoutSeconds", 300)
        try:
            timeout_seconds = int(timeout_raw)
        except ValueError as exc:
            raise RuntimeError(f"Direct x402 preflight invalid maxTimeoutSeconds: {timeout_raw}") from exc

        return X402Terms(accepted=accepted, amount=amount, timeout_seconds=timeout_seconds)

    async def _resolve_token_metadata(
        self,
        *,
        asset: str,
        accepted_extra: dict[str, Any] | None,
    ) -> tuple[str, str]:
        name = ""
        version = ""
        if accepted_extra:
            maybe_name = accepted_extra.get("name")
            maybe_version = accepted_extra.get("version")
            if isinstance(maybe_name, str):
                name = maybe_name.strip()
            if isinstance(maybe_version, str):
                version = maybe_version.strip()

        chain_name, chain_version = await self._load_token_metadata(asset)

        if not name:
            name = chain_name
        if not version:
            version = chain_version
        if not name:
            name = self._token_name_fallback
        if not version:
            version = self._token_version_fallback
        return name, version

    async def _load_token_metadata(self, asset: str) -> tuple[str, str]:
        if self._web3 is None:
            return "", ""

        checksum_asset = Web3.to_checksum_address(asset)

        def _fetch() -> tuple[str, str]:
            contract = self._web3.eth.contract(address=checksum_asset, abi=EIP3009_ABI)
            name = ""
            version = ""
            try:
                name = str(contract.functions.name().call())
            except Exception:
                name = ""
            try:
                version = str(contract.functions.version().call())
            except Exception:
                version = ""
            return name, version

        try:
            return await asyncio.to_thread(_fetch)
        except Exception:
            return "", ""

    def _build_authorization(self, amount: int, timeout_seconds: int, *, pay_to: str) -> dict[str, str]:
        now = int(time.time())
        valid_before = now + max(timeout_seconds, 1)
        nonce = "0x" + secrets.token_bytes(32).hex()
        return {
            "from": self._account.address,
            # For x402 exact EVM payments, auth recipient must match `payTo` from 402 terms.
            "to": pay_to,
            "value": str(amount),
            "validAfter": "0",
            "validBefore": str(valid_before),
            "nonce": nonce,
        }

    def _sign_authorization(
        self,
        *,
        authorization: dict[str, str],
        asset: str,
        chain_id: int,
        token_name: str,
        token_version: str,
    ) -> str:
        typed_data = {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "TransferWithAuthorization": [
                    {"name": "from", "type": "address"},
                    {"name": "to", "type": "address"},
                    {"name": "value", "type": "uint256"},
                    {"name": "validAfter", "type": "uint256"},
                    {"name": "validBefore", "type": "uint256"},
                    {"name": "nonce", "type": "bytes32"},
                ],
            },
            "primaryType": "TransferWithAuthorization",
            "domain": {
                "name": token_name,
                "version": token_version,
                "chainId": chain_id,
                "verifyingContract": Web3.to_checksum_address(asset),
            },
            "message": {
                "from": authorization["from"],
                "to": authorization["to"],
                "value": int(authorization["value"]),
                "validAfter": int(authorization["validAfter"]),
                "validBefore": int(authorization["validBefore"]),
                "nonce": authorization["nonce"],
            },
        }
        signable = encode_typed_data(full_message=typed_data)
        signed = Account.sign_message(signable, self._account.key)
        return "0x" + signed.signature.hex()


def _coerce_caip_network(value: Any, fallback_chain_id: int) -> str:
    raw = str(value or "").strip()
    if raw.startswith("eip155:"):
        return raw
    if raw.lower() == "kite-testnet":
        return f"eip155:{fallback_chain_id}"
    return f"eip155:{fallback_chain_id}"


def _coerce_chain_id(caip_network: str, fallback_chain_id: int) -> int:
    if caip_network.startswith("eip155:"):
        maybe = caip_network.split(":", 1)[1]
        if maybe.isdigit():
            return int(maybe)
    return fallback_chain_id


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception as exc:
        raise RuntimeError(f"Expected JSON response; got: {response.text[:400]}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected object JSON response; got: {type(payload).__name__}")
    return payload


def _safe_json_or_text(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return response.text[:600]
