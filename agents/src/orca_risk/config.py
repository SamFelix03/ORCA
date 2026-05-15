from __future__ import annotations

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RiskConfig(BaseSettings):
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

    x402_service_url: str = Field(alias="X402_SERVICE_URL")
    x402_execute_path: str = Field(default="/execute", alias="X402_EXECUTE_PATH")
    x402_network: str = Field(default="kite-testnet", alias="X402_NETWORK")
    x402_asset_address: str = Field(alias="X402_ASSET_ADDRESS")
    x402_max_amount_required_wei: int = Field(default=1_000_000, alias="X402_MAX_AMOUNT_REQUIRED_WEI")

    passport_cli_bin: str = Field(default="kpass", alias="PASSPORT_CLI_BIN")

    signal_domain_name: str = Field(default="ORCA Risk Instruction", alias="RISK_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="RISK_SIGNAL_DOMAIN_VERSION")

    @classmethod
    def _validate_optional_address(cls, value: str) -> str:
        from web3 import Web3

        value = value.strip()
        if value and not Web3.is_address(value):
            raise ValueError(f"Invalid EVM address: {value}")
        return value

    @field_validator("orca_registry_address")
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
