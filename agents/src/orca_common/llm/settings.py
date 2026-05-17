from __future__ import annotations

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class GroqSettingsMixin(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    groq_api_key: str = Field(alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.1-8b-instant", alias="GROQ_MODEL")
    groq_base_url: str = Field(default="https://api.groq.com/openai/v1", alias="GROQ_BASE_URL")
    groq_timeout_seconds: float = Field(default=15.0, alias="GROQ_TIMEOUT_SECONDS")
    groq_request_delay_seconds: float = Field(
        default=1.5,
        ge=0.0,
        alias="GROQ_REQUEST_DELAY_SECONDS",
    )
    groq_request_jitter_seconds: float = Field(
        default=1.0,
        ge=0.0,
        alias="GROQ_REQUEST_JITTER_SECONDS",
    )
    groq_max_retries: int = Field(default=3, ge=0, alias="GROQ_MAX_RETRIES")
    groq_retry_base_delay_seconds: float = Field(
        default=2.0,
        ge=0.1,
        alias="GROQ_RETRY_BASE_DELAY_SECONDS",
    )
    groq_retry_max_delay_seconds: float = Field(
        default=30.0,
        ge=0.1,
        alias="GROQ_RETRY_MAX_DELAY_SECONDS",
    )

    @model_validator(mode="after")
    def _require_groq_key(self) -> "GroqSettingsMixin":
        if not self.groq_api_key.strip():
            raise ValueError("GROQ_API_KEY is required for LLM-enabled agents")
        return self
