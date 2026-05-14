from __future__ import annotations

from web3 import Web3

from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.models import ActionType, PoAIRecord, YieldSignal


class PoAIReporter:
    def __init__(self, poai_client: PoAIClient, scout_epoch_id: int, scout_did_hash: bytes) -> None:
        self._poai_client = poai_client
        self._scout_epoch_id = scout_epoch_id
        self._scout_did_hash = scout_did_hash

    def report_signal(self, signal: YieldSignal, signal_hash: str) -> str:
        input_hash = Web3.keccak(text=signal.signal_id)
        outcome_hash = Web3.keccak(text=signal_hash)
        value_delta = int(signal.net_delta_apy * 10_000)

        record = PoAIRecord(
            agent_did_hash=self._scout_did_hash,
            action_type=ActionType.SIGNAL,
            input_hash=input_hash,
            outcome_hash=outcome_hash,
            value_delta=value_delta,
            timestamp=signal.timestamp,
        )
        return self._poai_client.record_signal_action(self._scout_epoch_id, record)
