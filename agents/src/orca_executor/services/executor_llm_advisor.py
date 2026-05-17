from __future__ import annotations

from orca_common.llm import GroqDeliberationClient, LlmDeliberation
from orca_common.llm.prompts import EXECUTOR_SYSTEM_PROMPT
from orca_common.events import RiskInstruction
from orca_executor.config import ExecutorConfig
from orca_executor.path_resolution import resolve_execution_path


class ExecutorLlmAdvisor:
    def __init__(self, client: GroqDeliberationClient) -> None:
        self._client = client

    async def deliberate(
        self,
        instruction: RiskInstruction,
        *,
        config: ExecutorConfig | None = None,
    ) -> LlmDeliberation:
        intent = instruction.execution_intent
        routing_hint = resolve_execution_path(instruction, config) if config else None
        payload = {
            "instruction": {
                "instruction_id": instruction.instruction_id,
                "signal_id": instruction.signal_id,
                "approved": instruction.approved,
                "src_chain": instruction.src_chain,
                "dst_chain": instruction.dst_chain,
                "src_protocol": instruction.src_protocol,
                "dst_protocol": instruction.dst_protocol,
                "suggested_amount": instruction.suggested_amount,
                "net_delta_apy": str(instruction.net_delta_apy),
            },
            "execution_intent": intent.model_dump() if intent else None,
            "executor_config": {
                "kite_chain_id": config.kite_chain_id,
                "cross_chain_mode": config.executor_cross_chain_mode,
                "deterministic_routing": config.executor_deterministic_routing,
            }
            if config
            else None,
            "routing_hint": {
                "execution_path": routing_hint.execution_path,
                "proceed": routing_hint.proceed,
                "reason": routing_hint.reason,
            }
            if routing_hint
            else None,
        }
        response, raw = await self._client.deliberate(EXECUTOR_SYSTEM_PROMPT, payload)
        return LlmDeliberation.from_response(
            agent_type="executor",
            model=self._client.model,
            response=response,
            raw_content=raw,
        )

    async def close(self) -> None:
        await self._client.close()
