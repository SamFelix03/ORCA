from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

import httpx
from redis.asyncio import Redis
from web3 import Web3

from orca_common.events import ExecutionSettledEvent, RiskInstruction, RiskInstructionEvent
from orca_common.internal_api import post_agent_deliberation
from orca_common.llm import GroqDeliberationClient
from orca_common.llm.deliberation import LlmDeliberation
from orca_executor.config import ExecutorConfig
from orca_executor import spoke_prep
from orca_executor.services.executor_llm_advisor import ExecutorLlmAdvisor
from orca_scout.integrations.passport_cli import PassportCLI
from orca_scout.integrations.poai_client import PoAIClient
from orca_scout.integrations.x402_client import X402Client
from orca_scout.models import ActionType, PoAIRecord


class ExecutorRuntime:
    def __init__(self, config: ExecutorConfig) -> None:
        self._config = config
        self._logger = logging.getLogger("orca_executor.runtime")
        self._redis = Redis.from_url(config.redis_url, decode_responses=False)
        self._x402 = X402Client(
            service_url=config.x402_service_url,
            execute_path=config.x402_execute_path,
            kpass_bin=config.passport_cli_bin,
            dry_run=config.x402_dry_run,
            passport_base_url=config.kite_passport_base_url,
            execution_mode=config.x402_execution_mode,
            signer_private_key=config.executor_private_key,
            facilitator_address=config.x402_facilitator_address,
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            token_name_fallback=config.x402_token_name_fallback,
            token_version_fallback=config.x402_token_version_fallback,
        )
        self._passport = PassportCLI(config.passport_cli_bin, base_url=config.kite_passport_base_url)
        if config.x402_dry_run:
            self._logger.warning("X402_DRY_RUN=true: Executor micropayments are simulated.")
        self._poai = PoAIClient(
            rpc_url=config.kite_rpc_url,
            chain_id=config.kite_chain_id,
            contract_address=config.poai_contract_address,
            signer_private_key=config.executor_private_key,
        )
        groq = GroqDeliberationClient(
            api_key=config.groq_api_key,
            model=config.groq_model,
            base_url=config.groq_base_url,
            timeout_seconds=config.groq_timeout_seconds,
        )
        self._llm_advisor = ExecutorLlmAdvisor(groq)
        self._http = httpx.AsyncClient(timeout=15.0)

    async def run_forever(self) -> None:
        await self._run_startup_preflight()
        self._logger.info(
            "Executor runtime ready. Subscribing to Redis stream %r (Risk instructions). Blocking up to 30s.",
            self._config.risk_instruction_stream_key,
        )
        first_cycle = True
        while True:
            if first_cycle:
                self._logger.info("Executor: establishing Passport session…")
                first_cycle = False
            await self._ensure_passport_session()
            stream_data = await self._redis.xread(
                {self._config.risk_instruction_stream_key: "$"},
                block=30_000,
                count=20,
            )
            if not stream_data:
                self._logger.info(
                    "Executor: idle — no Risk instructions on %r (will retry).",
                    self._config.risk_instruction_stream_key,
                )
                continue
            for _, records in stream_data:
                for event_id, fields in records:
                    payload_raw = fields.get(b"payload")
                    if not payload_raw:
                        raise RuntimeError(f"Executor received malformed stream event without payload at {event_id!r}")
                    payload = json.loads(payload_raw.decode("utf-8"))
                    await self._handle_instruction(payload)

    async def _run_startup_preflight(self) -> None:
        await self._redis.ping()
        self._logger.info("Executor Redis preflight OK.")
        self._passport.check_ready()
        self._logger.info("Executor Passport CLI preflight OK.")
        if not self._poai.is_connected():
            raise RuntimeError("Executor PoAI connectivity preflight failed.")
        self._logger.info("Executor PoAI RPC preflight OK.")

    async def _ensure_passport_session(self) -> None:
        self._passport.ensure_active_session(
            task_summary=self._config.passport_session_task_summary,
            max_per_tx=self._config.passport_session_max_per_tx,
            max_total=self._config.passport_session_max_total,
            ttl=self._config.passport_session_ttl,
            assets=self._config.passport_session_assets,
        )

    async def _handle_instruction(self, payload: dict[str, object]) -> None:
        event = RiskInstructionEvent.model_validate(payload)
        instruction = event.instruction

        if not instruction.approved:
            self._logger.info("Instruction %s rejected by risk agent. Skipping execution.", instruction.instruction_id)
            return

        if instruction.execution_intent is None:
            raise RuntimeError(f"Instruction {instruction.instruction_id} missing execution intent")

        llm_deliberation = await self._llm_advisor.deliberate(instruction)
        execution_path = str(llm_deliberation.verdict.get("execution_path", "abort"))
        proceed = bool(llm_deliberation.verdict.get("proceed", False))
        if execution_path == "abort" or not proceed:
            await self._publish_settled(
                instruction,
                success=False,
                status="llm_aborted",
                tx_hash="0x0000000000000000000000000000000000000000000000000000000000000000",
                llm_deliberation=llm_deliberation,
            )
            return

        intent = instruction.execution_intent
        vault_tx_hash: str | None = None
        if self._config.executor_submit_vault_tx:
            from eth_account import Account

            from orca_executor.vault_tx import submit_contract_call, submit_vault_execute_intent

            calldata = intent.vault_execute_calldata.strip()
            kite_addr = intent.kite_stub_address.strip()
            kite_calldata = intent.kite_stub_calldata.strip()

            if execution_path == "kite_deposit":
                vault_tx_hash = submit_contract_call(
                    rpc_url=self._config.kite_rpc_url,
                    chain_id=self._config.kite_chain_id,
                    private_key=self._config.executor_private_key,
                    to=kite_addr,
                    data=kite_calldata,
                    value_wei=intent.tx_value_wei,
                )
                self._logger.info("Executor: Kite stub deposit tx hash=%s", vault_tx_hash)
            elif execution_path in {"hub_bridge_then_vault", "vault_only"}:
                dst_chain = instruction.dst_chain
                if (
                    execution_path == "hub_bridge_then_vault"
                    and dst_chain != self._config.kite_chain_id
                    and self._config.executor_auto_bridge
                ):
                    hyp_dest = spoke_prep.CHAIN_ID_TO_HYP_DEST.get(dst_chain)
                    if not hyp_dest:
                        raise RuntimeError(
                            f"EXECUTOR_AUTO_BRIDGE requires a Hyperlane dest key for chain {dst_chain}; extend CHAIN_ID_TO_HYP_DEST."
                        )
                    recipient = self._config.cross_chain_beneficiary_address.strip()
                    if not recipient:
                        recipient = Account.from_key(self._config.executor_private_key).address
                    contracts = Path(self._config.contracts_dir).expanduser()
                    if not contracts.is_absolute():
                        contracts = (Path.cwd() / contracts).resolve()
                    spoke_prep.run_hub_to_dest_bridge(
                        contracts_dir=contracts,
                        hyp_dest=hyp_dest,
                        amount=instruction.suggested_amount,
                        recipient=recipient,
                        snapshot_path=self._config.hyperlane_snapshot_path,
                        warp_asset=self._config.hyperlane_warp_asset,
                        logger=self._logger,
                    )
                    time.sleep(self._config.bridge_wait_seconds)

                if dst_chain != self._config.kite_chain_id:
                    rpc_map_raw = self._config.executor_stub_chain_rpc_map.strip()
                    if not rpc_map_raw:
                        rpc_map_raw = os.environ.get("SCOUT_STUB_CHAIN_RPC_MAP", "").strip()
                    rpc_map = spoke_prep.parse_chain_rpc_map(rpc_map_raw)
                    rpc = rpc_map.get(dst_chain)
                    if not rpc:
                        raise RuntimeError(
                            f"Spoke execution requires EXECUTOR_STUB_CHAIN_RPC_MAP or SCOUT_STUB_CHAIN_RPC_MAP "
                            f"with chainId {dst_chain}"
                        )
                    manifest_path = spoke_prep.resolve_collateral_manifest_path(
                        self._config.collateral_manifest_path
                    )
                    manifest = spoke_prep.load_collateral_manifest(manifest_path)
                    token, adapter = spoke_prep.spoke_collateral_and_adapter(manifest, dst_chain)
                    from eth_account import Account

                    signer_address = Account.from_key(self._config.executor_private_key).address
                    beneficiary = spoke_prep.resolve_spoke_beneficiary(
                        oapp_calldata=intent.oapp_calldata,
                        config_beneficiary=self._config.cross_chain_beneficiary_address,
                        signer_address=signer_address,
                    )
                    spoke_prep.assert_spoke_beneficiary_can_approve(
                        beneficiary=beneficiary,
                        signer_address=signer_address,
                        vault_address=intent.vault_address,
                        logger=self._logger,
                    )
                    spoke_prep.ensure_erc20_allowance(
                        rpc_url=rpc,
                        chain_id=dst_chain,
                        private_key=self._config.executor_private_key,
                        token=token,
                        spender=adapter,
                        min_amount=intent.amount_for_rule,
                        logger=self._logger,
                        owner=beneficiary,
                    )

                if not calldata or calldata.lower() == "0x":
                    raise RuntimeError("Missing execution_intent.vault_execute_calldata for vault→OApp spoke path.")

                if execution_path in {"hub_bridge_then_vault", "vault_only"}:
                    vault_tx_hash = submit_vault_execute_intent(
                        rpc_url=self._config.kite_rpc_url,
                        chain_id=self._config.kite_chain_id,
                        private_key=self._config.executor_private_key,
                        intent=intent,
                    )
                    self._logger.info("Executor: ClientAgentVault execute tx hash=%s", vault_tx_hash)
            else:
                raise RuntimeError(f"Unsupported LLM execution_path: {execution_path}")

        # Placeholder strict contract execution surface; in production this must use AA SDK/userop path.
        executor_did_hash = Web3.keccak(text=self._config.executor_agent_did.strip())
        poai_tx_hash = self._poai.record_signal_action(
            self._config.scout_epoch_id,
            PoAIRecord(
                agent_did_hash=executor_did_hash,
                action_type=ActionType.EXECUTION,
                input_hash=b"\x00" * 32,
                outcome_hash=b"\x00" * 31 + b"\x02",
                value_delta=int(instruction.suggested_amount),
                timestamp=int(time.time()),
            ),
        )

        tx_hash = vault_tx_hash or poai_tx_hash

        await self._publish_settled(
            instruction,
            success=True,
            status="executed",
            tx_hash=tx_hash,
            llm_deliberation=llm_deliberation,
        )

    async def _publish_settled(
        self,
        instruction: RiskInstruction,
        *,
        success: bool,
        status: str,
        tx_hash: str,
        llm_deliberation: LlmDeliberation,
        payment_tx_hash: str | None = None,
    ) -> None:
        if payment_tx_hash is None:
            payment = await self._x402.send_micropayment(
                to_did=self._config.audit_agent_did,
                amount_wei=self._config.x402_max_amount_required_wei,
                network=self._config.x402_network,
                asset_address=self._config.x402_asset_address,
                signal_id=instruction.signal_id,
            )
            payment_tx_hash = str(payment.get("txHash", ""))
            if not payment_tx_hash:
                raise RuntimeError("Executor x402 payment succeeded without txHash; strict mode requires tx hash.")

        settled = ExecutionSettledEvent(
            event="execution.settled",
            instruction_id=instruction.instruction_id,
            signal_id=instruction.signal_id,
            executor_did=self._config.executor_agent_did,
            success=success,
            status=status,
            tx_hash=tx_hash,
            paymentTxHash=payment_tx_hash,
            paymentAmountWei=str(self._config.x402_max_amount_required_wei),
            paymentAsset=self._config.x402_asset_address,
            paymentNetwork=self._config.x402_network,
            timestamp=int(time.time()),
            llm_deliberation=llm_deliberation,
        )
        await self._redis.xadd(
            self._config.execution_stream_key,
            {"payload": settled.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )
        await post_agent_deliberation(
            base_url=self._config.orca_api_base_url,
            api_key=self._config.orca_internal_api_key,
            signal_id=instruction.signal_id,
            agent_type="executor",
            agent_did=self._config.executor_agent_did,
            step="executor.execution",
            deliberation=llm_deliberation,
            client=self._http,
        )
        self._logger.info(
            "Execution settled instruction_id=%s success=%s status=%s tx_hash=%s",
            instruction.instruction_id,
            success,
            status,
            tx_hash,
        )

    async def close(self) -> None:
        await self._llm_advisor.close()
        await self._http.aclose()
        await self._x402.close()
        await self._redis.aclose()
