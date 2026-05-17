from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from orca_common.llm.settings import GroqSettingsMixin
from orca_common.market.config import MarketDataSettingsMixin


class RiskConfig(GroqSettingsMixin, MarketDataSettingsMixin, BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    redis_url: str = Field(alias="REDIS_URL")
    scout_signal_stream_key: str = Field(default="orca:signals:scout", alias="SCOUT_REDIS_STREAM_KEY")
    risk_instruction_stream_key: str = Field(default="orca:instructions:risk", alias="RISK_INSTRUCTION_STREAM_KEY")

    risk_did: str = Field(alias="RISK_AGENT_DID")
    risk_private_key: str = Field(alias="RISK_PRIVATE_KEY")
    executor_agent_did: str = Field(alias="EXECUTOR_AGENT_DID")
    kite_chain_id: int = Field(alias="KITE_CHAIN_ID")
    kite_rpc_url: str = Field(default="", alias="KITE_RPC_URL")
    orca_registry_address: str = Field(default="", alias="ORCA_REGISTRY_ADDRESS")

    orca_api_base_url: str = Field(default="http://127.0.0.1:4000", alias="ORCA_API_BASE_URL")
    orca_internal_api_key: str = Field(default="", alias="ORCA_INTERNAL_API_KEY")
    risk_max_apy_drift_bps: int = Field(default=50, ge=0, alias="RISK_MAX_APY_DRIFT_BPS")
    risk_max_utilization: float = Field(default=0.95, ge=0, le=1, alias="RISK_MAX_UTILIZATION")

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
        default="ORCA Risk instruction micropayments",
        alias="PASSPORT_SESSION_TASK_SUMMARY",
    )
    passport_session_max_per_tx: int = Field(default=2, alias="PASSPORT_SESSION_MAX_PER_TX")
    passport_session_max_total: int = Field(default=100, alias="PASSPORT_SESSION_MAX_TOTAL")
    passport_session_ttl: str = Field(default="24h", alias="PASSPORT_SESSION_TTL")
    passport_session_assets: str = Field(default="PIEUSD", alias="PASSPORT_SESSION_ASSETS")

    risk_scout_did_allowlist: str = Field(
        default="",
        alias="RISK_SCOUT_DID_ALLOWLIST",
        description="Comma-separated scout DIDs; when non-empty, only these DIDs pass Risk after registry checks.",
    )

    signal_domain_name: str = Field(default="ORCA Risk Instruction", alias="RISK_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="RISK_SIGNAL_DOMAIN_VERSION")

    @classmethod
    def _validate_optional_address(cls, value: str) -> str:
        from web3 import Web3

        value = value.strip()
        if value and not Web3.is_address(value):
            raise ValueError(f"Invalid EVM address: {value}")
        return value

    @field_validator("orca_registry_address", "x402_facilitator_address")
    @classmethod
    def _registry_address(cls, value: str) -> str:
        return cls._validate_optional_address(value)

    @model_validator(mode="after")
    def _registry_requires_rpc(self) -> "RiskConfig":
        if self.orca_registry_address.strip() and not self.kite_rpc_url.strip():
            raise ValueError(
                "ORCA_REGISTRY_ADDRESS is set but KITE_RPC_URL is empty (needed for isActiveAgent reads)."
            )
        return self
