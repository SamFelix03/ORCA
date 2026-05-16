from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from redis.asyncio import Redis

from orca_common.events import ExecutionSettledEvent, RiskInstructionEvent
from orca_executor.config import ExecutorConfig
from orca_executor import spoke_prep
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

        # Strict path: require execution intent and perform the vault call through configured tx relay path.
        if instruction.execution_intent is None:
            raise RuntimeError(f"Instruction {instruction.instruction_id} missing execution intent")

        intent = instruction.execution_intent
        vault_tx_hash: str | None = None
        if self._config.executor_submit_vault_tx:
            from eth_account import Account

            from orca_executor.vault_tx import submit_contract_call, submit_vault_execute_intent

            assert intent is not None
            calldata = intent.vault_execute_calldata.strip()
            kite_addr = intent.kite_stub_address.strip()
            kite_calldata = intent.kite_stub_calldata.strip()
            is_kite_deposit = (
                instruction.dst_chain == self._config.kite_chain_id
                and bool(kite_addr)
                and bool(kite_calldata)
                and kite_calldata.lower() != "0x"
            )

            if is_kite_deposit:
                vault_tx_hash = submit_contract_call(
                    rpc_url=self._config.kite_rpc_url,
                    chain_id=self._config.kite_chain_id,
                    private_key=self._config.executor_private_key,
                    to=kite_addr,
                    data=kite_calldata,
                    value_wei=intent.tx_value_wei,
                )
                self._logger.info("Executor: Kite stub deposit tx hash=%s", vault_tx_hash)
            else:
                dst_chain = instruction.dst_chain
                if dst_chain != self._config.kite_chain_id and self._config.executor_auto_bridge:
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
                    spoke_prep.ensure_erc20_allowance(
                        rpc_url=rpc,
                        chain_id=dst_chain,
                        private_key=self._config.executor_private_key,
                        token=token,
                        spender=adapter,
                        min_amount=intent.amount_for_rule,
                        logger=self._logger,
                    )

                if not calldata or calldata.lower() == "0x":
                    raise RuntimeError("Missing execution_intent.vault_execute_calldata for vault→OApp spoke path.")

                vault_tx_hash = submit_vault_execute_intent(
                    rpc_url=self._config.kite_rpc_url,
                    chain_id=self._config.kite_chain_id,
                    private_key=self._config.executor_private_key,
                    intent=intent,
                )
                self._logger.info("Executor: ClientAgentVault execute tx hash=%s", vault_tx_hash)

        # Placeholder strict contract execution surface; in production this must use AA SDK/userop path.
        poai_tx_hash = self._poai.record_signal_action(
            self._config.scout_epoch_id,
            PoAIRecord(
                agent_did_hash=b"\x00" * 31 + b"\x01",
                action_type=ActionType.EXECUTION,
                input_hash=b"\x00" * 32,
                outcome_hash=b"\x00" * 31 + b"\x02",
                value_delta=int(instruction.suggested_amount),
                timestamp=int(time.time()),
            ),
        )

        tx_hash = vault_tx_hash or poai_tx_hash

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
            success=True,
            status="executed",
            tx_hash=tx_hash,
            paymentTxHash=payment_tx_hash,
            timestamp=int(time.time()),
        )
        await self._redis.xadd(
            self._config.execution_stream_key,
            {"payload": settled.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )
        self._logger.info("Execution settled instruction_id=%s tx_hash=%s", instruction.instruction_id, tx_hash)

    async def close(self) -> None:
        await self._x402.close()
        await self._redis.aclose()
