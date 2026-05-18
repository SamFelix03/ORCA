from __future__ import annotations

from typing import Any

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from orca_common.agent_config import merge_settings_with_agent_config
from orca_common.llm.settings import GroqSettingsMixin


class AuditConfig(GroqSettingsMixin, BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    redis_url: str = Field(alias="REDIS_URL")
    scout_signal_stream_key: str = Field(default="orca:signals:scout", alias="SCOUT_REDIS_STREAM_KEY")
    risk_instruction_stream_key: str = Field(default="orca:instructions:risk", alias="RISK_INSTRUCTION_STREAM_KEY")
    execution_stream_key: str = Field(default="orca:executions:executor", alias="EXECUTION_STREAM_KEY")
    audit_stream_key: str = Field(default="orca:audit", alias="AUDIT_STREAM_KEY")

    audit_did: str = Field(alias="AUDIT_AGENT_DID")
    audit_private_key: str = Field(alias="AUDIT_PRIVATE_KEY")
    kite_rpc_url: str = Field(alias="KITE_RPC_URL")
    kite_chain_id: int = Field(alias="KITE_CHAIN_ID")
    poai_contract_address: str = Field(alias="POAI_CONTRACT_ADDRESS")
    scout_epoch_id: int = Field(default=1, alias="SCOUT_EPOCH_ID")
    orca_api_base_url: str = Field(default="http://127.0.0.1:4000", alias="ORCA_API_BASE_URL")
    orca_internal_api_key: str = Field(default="", alias="ORCA_INTERNAL_API_KEY")

    @model_validator(mode="before")
    @classmethod
    def _merge_agent_file_defaults(cls, data: Any) -> Any:
        return merge_settings_with_agent_config(data)
