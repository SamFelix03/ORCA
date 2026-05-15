from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ExecutorConfig(BaseSettings):
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

    x402_service_url: str = Field(alias="X402_SERVICE_URL")
    x402_execute_path: str = Field(default="/execute", alias="X402_EXECUTE_PATH")
    x402_network: str = Field(default="kite-testnet", alias="X402_NETWORK")
    x402_asset_address: str = Field(alias="X402_ASSET_ADDRESS")
    x402_max_amount_required_wei: int = Field(default=1_000_000, alias="X402_MAX_AMOUNT_REQUIRED_WEI")
    x402_dry_run: bool = Field(default=False, alias="X402_DRY_RUN")

    passport_cli_bin: str = Field(default="kpass", alias="PASSPORT_CLI_BIN")
    signal_domain_name: str = Field(default="ORCA Executor Settlement", alias="EXECUTOR_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="EXECUTOR_SIGNAL_DOMAIN_VERSION")
