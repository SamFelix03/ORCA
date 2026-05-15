from __future__ import annotations

from pydantic import Field
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

    x402_service_url: str = Field(alias="X402_SERVICE_URL")
    x402_execute_path: str = Field(default="/execute", alias="X402_EXECUTE_PATH")
    x402_network: str = Field(default="kite-testnet", alias="X402_NETWORK")
    x402_asset_address: str = Field(alias="X402_ASSET_ADDRESS")
    x402_max_amount_required_wei: int = Field(default=1_000_000, alias="X402_MAX_AMOUNT_REQUIRED_WEI")

    passport_cli_bin: str = Field(default="kpass", alias="PASSPORT_CLI_BIN")

    signal_domain_name: str = Field(default="ORCA Risk Instruction", alias="RISK_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="RISK_SIGNAL_DOMAIN_VERSION")
