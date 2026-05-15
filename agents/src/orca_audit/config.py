from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuditConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    redis_url: str = Field(alias="REDIS_URL")
    scout_signal_stream_key: str = Field(default="orca:signals:scout", alias="SCOUT_REDIS_STREAM_KEY")
    risk_instruction_stream_key: str = Field(default="orca:instructions:risk", alias="RISK_INSTRUCTION_STREAM_KEY")
    execution_stream_key: str = Field(default="orca:executions:executor", alias="EXECUTION_STREAM_KEY")

    audit_did: str = Field(alias="AUDIT_AGENT_DID")
    audit_private_key: str = Field(alias="AUDIT_PRIVATE_KEY")
    kite_rpc_url: str = Field(alias="KITE_RPC_URL")
    kite_chain_id: int = Field(alias="KITE_CHAIN_ID")
    poai_contract_address: str = Field(alias="POAI_CONTRACT_ADDRESS")
    scout_epoch_id: int = Field(default=1, alias="SCOUT_EPOCH_ID")
