from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from web3 import Web3

from orca_common.agent_config import merge_settings_with_agent_config
from orca_common.llm.settings import GroqSettingsMixin


class ExecutorConfig(GroqSettingsMixin, BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    redis_url: str = Field(alias="REDIS_URL")
    risk_instruction_stream_key: str = Field(default="orca:instructions:risk", alias="RISK_INSTRUCTION_STREAM_KEY")
    execution_stream_key: str = Field(default="orca:executions:executor", alias="EXECUTION_STREAM_KEY")

    executor_agent_did: str = Field(alias="EXECUTOR_AGENT_DID")
    executor_private_key: str = Field(alias="EXECUTOR_PRIVATE_KEY")
    audit_agent_did: str = Field(alias="AUDIT_AGENT_DID")
    kite_chain_id: int = Field(alias="KITE_CHAIN_ID")
    kite_rpc_url: str = Field(alias="KITE_RPC_URL")
    poai_contract_address: str = Field(alias="POAI_CONTRACT_ADDRESS")
    scout_epoch_id: int = Field(default=1, alias="SCOUT_EPOCH_ID")
    orca_api_base_url: str = Field(default="http://127.0.0.1:4000", alias="ORCA_API_BASE_URL")
    orca_internal_api_key: str = Field(default="", alias="ORCA_INTERNAL_API_KEY")

    x402_service_url: str = Field(alias="X402_SERVICE_URL")
    x402_execute_path: str = Field(default="/execute", alias="X402_EXECUTE_PATH")
    x402_network: str = Field(default="kite-testnet", alias="X402_NETWORK")
    x402_asset_address: str = Field(alias="X402_ASSET_ADDRESS")
    x402_execution_mode: Literal["passport", "direct"] = Field(default="direct", alias="X402_EXECUTION_MODE")
    x402_facilitator_address: str = Field(
        default="0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
        alias="X402_FACILITATOR_ADDRESS",
    )
    x402_token_name_fallback: str = Field(default="pieUSD", alias="X402_TOKEN_NAME_FALLBACK")
    x402_token_version_fallback: str = Field(default="1", alias="X402_TOKEN_VERSION_FALLBACK")
    x402_max_amount_required_wei: int = Field(default=1_000_000, alias="X402_MAX_AMOUNT_REQUIRED_WEI")
    x402_dry_run: bool = Field(default=False, alias="X402_DRY_RUN")

    passport_cli_bin: str = Field(default="kpass", alias="PASSPORT_CLI_BIN")
    kite_passport_base_url: str = Field(default="", alias="KITE_PASSPORT_BASE_URL")
    passport_session_task_summary: str = Field(
        default="ORCA Executor settlement micropayments",
        alias="PASSPORT_SESSION_TASK_SUMMARY",
    )
    passport_session_max_per_tx: int = Field(default=2, alias="PASSPORT_SESSION_MAX_PER_TX")
    passport_session_max_total: int = Field(default=100, alias="PASSPORT_SESSION_MAX_TOTAL")
    passport_session_ttl: str = Field(default="24h", alias="PASSPORT_SESSION_TTL")
    passport_session_assets: str = Field(default="PIEUSD", alias="PASSPORT_SESSION_ASSETS")
    signal_domain_name: str = Field(default="ORCA Executor Settlement", alias="EXECUTOR_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="EXECUTOR_SIGNAL_DOMAIN_VERSION")

    executor_submit_vault_tx: bool = Field(
        default=False,
        alias="EXECUTOR_SUBMIT_VAULT_TX",
        description="If true, broadcast execution_intent.vault_execute_calldata from executor EOA (strict path).",
    )

    executor_auto_bridge: bool = Field(
        default=False,
        alias="EXECUTOR_AUTO_BRIDGE",
        description="Legacy mailbox_oapp mode: warp before vault.execute when true.",
    )
    executor_cross_chain_mode: Literal["warp_to_stub", "mailbox_oapp"] = Field(
        default="warp_to_stub",
        alias="EXECUTOR_CROSS_CHAIN_MODE",
        description=(
            "warp_to_stub: Hyperlane warp Kite USDT → destination stub (intent.to_protocol); "
            "no RemoteAdapter beneficiary pull. mailbox_oapp: legacy OApp dispatch + spoke approve."
        ),
    )
    executor_deterministic_routing: bool = Field(
        default=True,
        alias="EXECUTOR_DETERMINISTIC_ROUTING",
        description=(
            "When true, resolve kite_deposit / warp_to_stub / mailbox paths from dst_chain and env "
            "instead of allowing LLM abort on spoke instructions."
        ),
    )
    hyperlane_snapshot_path: str = Field(
        default="",
        alias="HYPERLANE_INTEGRATION_SNAPSHOT",
        description="Optional path to orca-integration JSON; forwarded to Hardhat warp script.",
    )
    hyperlane_warp_asset: str = Field(
        default="USDT",
        alias="HYP_WARP_ASSET",
        description="Snapshot routes key prefix (must exist as e.g. USDT/kitetestnet-sepolia).",
    )
    contracts_dir: str = Field(
        default="contracts",
        alias="EXECUTOR_CONTRACTS_DIR",
        description="Directory containing Hardhat config (run executor from repo root or set an absolute path).",
    )
    bridge_wait_seconds: int = Field(default=60, ge=0, alias="EXECUTOR_BRIDGE_WAIT_SECONDS")
    collateral_manifest_path: str = Field(
        default="contracts/config/orca-collateral.manifest.json",
        alias="EXECUTOR_COLLATERAL_MANIFEST_PATH",
    )
    executor_stub_chain_rpc_map: str = Field(
        default="",
        alias="EXECUTOR_STUB_CHAIN_RPC_MAP",
        description="chainId:https URL CSV for spoke JSON-RPC; if empty, SCOUT_STUB_CHAIN_RPC_MAP is used.",
    )
    cross_chain_beneficiary_address: str = Field(
        default="",
        alias="SCOUT_CROSS_CHAIN_BENEFICIARY",
        description="Hyperlane RECIPIENT / RemoteAdapter transferFrom beneficiary; defaults to executor EOA when empty.",
    )

    @model_validator(mode="before")
    @classmethod
    def _merge_agent_file_defaults(cls, data: Any) -> Any:
        return merge_settings_with_agent_config(data)

    @field_validator("executor_auto_bridge", mode="before")
    @classmethod
    def _coerce_bool_flag(cls, v: object) -> bool:
        if v in (True, "true", "True", "1", 1, "yes", "YES", "on", "ON"):
            return True
        return False

    @field_validator("executor_deterministic_routing", mode="before")
    @classmethod
    def _coerce_deterministic_routing(cls, v: object) -> bool:
        if v in (False, "false", "False", "0", 0, "no", "NO", "off", "OFF"):
            return False
        if v in (True, "true", "True", "1", 1, "yes", "YES", "on", "ON"):
            return True
        return True

    @field_validator("executor_private_key")
    @classmethod
    def _validate_private_key(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"0x[a-fA-F0-9]{64}", value):
            raise ValueError("EXECUTOR_PRIVATE_KEY must be 0x-prefixed 32-byte hex")
        return value

    @field_validator("cross_chain_beneficiary_address")
    @classmethod
    def _validate_beneficiary(cls, value: str) -> str:
        value = value.strip()
        if value and not Web3.is_address(value):
            raise ValueError(f"Invalid SCOUT_CROSS_CHAIN_BENEFICIARY: {value}")
        return value
