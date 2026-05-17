from __future__ import annotations

import json
from hashlib import sha256

from redis.asyncio import Redis
from tenacity import retry, stop_after_attempt, wait_exponential

from orca_common.llm.deliberation import LlmDeliberation
from orca_scout.integrations.x402_client import X402Client
from orca_scout.models import YieldSignal


class SignalBroadcaster:
    def __init__(
        self,
        redis_client: Redis,
        redis_stream_key: str,
        x402_client: X402Client,
        risk_agent_did: str,
        x402_network: str,
        x402_asset_address: str,
        x402_max_amount_required_wei: int,
    ) -> None:
        self._redis_client = redis_client
        self._redis_stream_key = redis_stream_key
        self._x402_client = x402_client
        self._risk_agent_did = risk_agent_did
        self._x402_network = x402_network
        self._x402_asset_address = x402_asset_address
        self._x402_max_amount_required_wei = x402_max_amount_required_wei

    async def broadcast(self, signal: YieldSignal, llm_deliberation: LlmDeliberation) -> tuple[str, str]:
        payment = await self._x402_client.send_micropayment(
            to_did=self._risk_agent_did,
            amount_wei=self._x402_max_amount_required_wei,
            network=self._x402_network,
            asset_address=self._x402_asset_address,
            signal_id=signal.signal_id,
        )
        payment_tx = str(payment.get("txHash", ""))

        signal_wire = signal.to_wire()
        event_payload = {
            "event": "scout.signal.created",
            "signal": signal_wire,
            "paymentTxHash": payment_tx,
            "paymentAmountWei": str(self._x402_max_amount_required_wei),
            "paymentAsset": self._x402_asset_address,
            "paymentNetwork": self._x402_network,
            "llm_deliberation": llm_deliberation.model_dump(),
        }
        event_id = await self._write_event(event_payload)

        signal_hash = sha256(json.dumps(signal_wire, sort_keys=True).encode("utf-8")).hexdigest()
        return event_id.decode("utf-8"), signal_hash

    @retry(wait=wait_exponential(min=1, max=4), stop=stop_after_attempt(3), reraise=True)
    async def _write_event(self, event_payload: dict[str, object]) -> bytes:
        return await self._redis_client.xadd(
            self._redis_stream_key,
            {"payload": json.dumps(event_payload)},
            maxlen=10_000,
            approximate=True,
        )
