from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from web3 import Web3


class ScoutConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    scout_did: str = Field(alias="SCOUT_DID")
    scout_private_key: str = Field(alias="SCOUT_PRIVATE_KEY")
    risk_agent_did: str = Field(alias="RISK_AGENT_DID")
    scan_interval_seconds: int = Field(default=60, ge=1, alias="SCAN_INTERVAL_SECONDS")
    min_net_delta_apy: Decimal = Field(default=Decimal("0.50"), alias="SCOUT_MIN_NET_DELTA_APY")
    default_suggested_amount: int = Field(default=10_000, alias="SCOUT_DEFAULT_SUGGESTED_AMOUNT")
    max_suggested_amount: int = Field(default=50_000, alias="SCOUT_MAX_SUGGESTED_AMOUNT")
    settlement_asset_symbol: str = Field(default="USDT", alias="SCOUT_SETTLEMENT_ASSET_SYMBOL")
    scout_allowed_route_pairs: str = Field(
        default="2368:11155111,2368:421614,2368:11155420,2368:84532",
        alias="SCOUT_ALLOWED_ROUTE_PAIRS",
    )
    scout_disable_route_filter: bool = Field(default=False, alias="SCOUT_DISABLE_ROUTE_FILTER")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    redis_url: str = Field(alias="REDIS_URL")
    redis_stream_key: str = Field(default="orca:signals:scout", alias="SCOUT_REDIS_STREAM_KEY")

    # Legacy Lucid fields retained for backward compatibility but not primary in hybrid mode.
    lucid_api_base_url: str = Field(default="", alias="LUCID_API_BASE_URL")
    lucid_api_key: str = Field(default="", alias="LUCID_API_KEY")
    lucid_timeout_seconds: float = Field(default=10.0, alias="LUCID_TIMEOUT_SECONDS")
    lucid_market_path: str = Field(default="/v1/markets", alias="LUCID_MARKET_PATH")
    scout_market_data_provider: Literal["hybrid", "lucid"] = Field(default="hybrid", alias="SCOUT_MARKET_DATA_PROVIDER")
    defillama_api_base_url: str = Field(default="https://yields.llama.fi", alias="DEFILLAMA_API_BASE_URL")
    defillama_pools_path: str = Field(default="/pools", alias="DEFILLAMA_POOLS_PATH")
    defillama_timeout_seconds: float = Field(default=10.0, alias="DEFILLAMA_TIMEOUT_SECONDS")
    defillama_min_tvl_usd: float = Field(default=100_000, alias="DEFILLAMA_MIN_TVL_USD")
    aave_data_api_base_url: str = Field(default="", alias="AAVE_DATA_API_BASE_URL")
    aave_data_api_key: str = Field(default="", alias="AAVE_DATA_API_KEY")
    compound_data_api_base_url: str = Field(default="", alias="COMPOUND_DATA_API_BASE_URL")
    morpho_data_api_base_url: str = Field(default="", alias="MORPHO_DATA_API_BASE_URL")
    uniswap_data_api_base_url: str = Field(default="", alias="UNISWAP_DATA_API_BASE_URL")

    goldsky_api_base_url: str = Field(alias="GOLDSKY_API_BASE_URL")
    goldsky_api_key: str = Field(alias="GOLDSKY_API_KEY")
    goldsky_timeout_seconds: float = Field(default=10.0, alias="GOLDSKY_TIMEOUT_SECONDS")
    goldsky_query_path: str = Field(default="/query", alias="GOLDSKY_QUERY_PATH")
    goldsky_subgraph_id: str = Field(alias="GOLDSKY_SUBGRAPH_ID")

    bridge_fee_api_base_url: str = Field(default="", alias="BRIDGE_FEE_API_BASE_URL")
    bridge_fee_api_key: str = Field(default="", alias="BRIDGE_FEE_API_KEY")
    bridge_fee_path: str = Field(default="/v1/quote", alias="BRIDGE_FEE_PATH")
    bridge_fee_timeout_seconds: float = Field(default=10.0, alias="BRIDGE_FEE_TIMEOUT_SECONDS")
    bridge_fee_response_field: str = Field(default="estimatedFeeUsdc", alias="BRIDGE_FEE_RESPONSE_FIELD")
    bridge_fee_asset_param: str = Field(default="assetSymbol", alias="BRIDGE_FEE_ASSET_PARAM")

    x402_service_url: str = Field(default="", alias="X402_SERVICE_URL")
    x402_execute_path: str = Field(default="/execute", alias="X402_EXECUTE_PATH")
    x402_api_key: str = Field(default="", alias="X402_API_KEY")
    x402_asset_address: str = Field(alias="X402_ASSET_ADDRESS")
    x402_network: str = Field(default="kite-testnet", alias="X402_NETWORK")
    x402_max_amount_required_wei: int = Field(default=1_000_000, alias="X402_MAX_AMOUNT_REQUIRED_WEI")
    x402_dry_run: bool = Field(
        default=False,
        alias="X402_DRY_RUN",
        description="Skip kpass x402 execute; emit placeholder tx hash (dev without X402_SERVICE_URL).",
    )

    scout_llm_enabled: bool = Field(default=False, alias="SCOUT_LLM_ENABLED")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.1-8b-instant", alias="GROQ_MODEL")
    groq_base_url: str = Field(default="https://api.groq.com/openai/v1", alias="GROQ_BASE_URL")
    groq_timeout_seconds: float = Field(default=15.0, alias="GROQ_TIMEOUT_SECONDS")
    groq_max_candidates: int = Field(default=5, ge=1, le=20, alias="GROQ_MAX_CANDIDATES")

    kite_rpc_url: str = Field(alias="KITE_RPC_URL")
    kite_chain_id: int = Field(alias="KITE_CHAIN_ID")
    poai_contract_address: str = Field(alias="POAI_CONTRACT_ADDRESS")
    scout_epoch_id: int = Field(default=1, ge=1, alias="SCOUT_EPOCH_ID")
    orca_registry_address: str = Field(default="", alias="ORCA_REGISTRY_ADDRESS")
    scout_require_registry: bool = Field(default=False, alias="SCOUT_REQUIRE_REGISTRY")

    passport_cli_bin: str = Field(default="kpass", alias="PASSPORT_CLI_BIN")
    passport_session_task_summary: str = Field(
        default="ORCA Scout signal micropayments and service discovery",
        alias="PASSPORT_SESSION_TASK_SUMMARY",
    )
    passport_session_max_per_tx: int = Field(default=2, alias="PASSPORT_SESSION_MAX_PER_TX")
    passport_session_max_total: int = Field(default=100, alias="PASSPORT_SESSION_MAX_TOTAL")
    passport_session_ttl: str = Field(default="24h", alias="PASSPORT_SESSION_TTL")
    passport_session_assets: str = Field(default="USDT", alias="PASSPORT_SESSION_ASSETS")

    signal_domain_name: str = Field(default="ORCA Scout Signal", alias="SCOUT_SIGNAL_DOMAIN_NAME")
    signal_domain_version: str = Field(default="1", alias="SCOUT_SIGNAL_DOMAIN_VERSION")
    scout_routes_artifact_path: str = Field(
        default="../hyperlane/outputs/snapshots/orca-integration.latest.json",
        alias="SCOUT_ROUTES_ARTIFACT_PATH",
    )
    execution_intent_enabled: bool = Field(default=True, alias="SCOUT_EXECUTION_INTENT_ENABLED")
    client_agent_vault_address: str = Field(default="", alias="CLIENT_AGENT_VAULT_ADDRESS")
    orca_oapp_address: str = Field(default="", alias="ORCA_OAPP_ADDRESS")
    protocol_address_map: str = Field(default="", alias="SCOUT_PROTOCOL_ADDRESS_MAP")
    trusted_remote_map: str = Field(default="", alias="HYP_TRUSTED_REMOTES")
    execution_hook_metadata_hex: str = Field(default="0x", alias="SCOUT_EXECUTION_HOOK_METADATA_HEX")
    execution_tx_value_wei: int = Field(default=0, alias="SCOUT_EXECUTION_TX_VALUE_WEI")

    def allowed_route_pairs_set(self) -> set[tuple[int, int]]:
        raw = self.scout_allowed_route_pairs.strip()
        if not raw:
            raw = self._load_pairs_from_artifact()
        return self._parse_route_pairs(raw)

    @staticmethod
    def _parse_route_pairs(raw: str) -> set[tuple[int, int]]:
        pairs: set[tuple[int, int]] = set()
        if not raw:
            return pairs
        for entry in raw.split(","):
            item = entry.strip()
            if not item:
                continue
            parts = item.split(":")
            if len(parts) != 2:
                raise ValueError(
                    f"Invalid SCOUT_ALLOWED_ROUTE_PAIRS item '{item}'. Expected 'srcChainId:dstChainId'."
                )
            src, dst = parts
            pairs.add((int(src), int(dst)))
        return pairs

    def _load_pairs_from_artifact(self) -> str:
        path = Path(self.scout_routes_artifact_path).expanduser()
        if not path.exists():
            return ""
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return str(payload.get("env", {}).get("SCOUT_ALLOWED_ROUTE_PAIRS", ""))
        except Exception:
            return ""

    @field_validator("scout_did", "risk_agent_did")
    @classmethod
    def _validate_did(cls, value: str) -> str:
        value = value.strip()
        if not value or not value.startswith("did:"):
            raise ValueError("Expected DID string like did:kite:orca/scout-1")
        return value

    @field_validator("scout_private_key")
    @classmethod
    def _validate_private_key(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"0x[a-fA-F0-9]{64}", value):
            raise ValueError("SCOUT_PRIVATE_KEY must be 0x-prefixed 32-byte hex")
        return value

    @field_validator("poai_contract_address", "x402_asset_address", "client_agent_vault_address", "orca_oapp_address", "orca_registry_address")
    @classmethod
    def _validate_optional_address(cls, value: str) -> str:
        value = value.strip()
        if value and not Web3.is_address(value):
            raise ValueError(f"Invalid EVM address: {value}")
        return value

    @field_validator("execution_hook_metadata_hex")
    @classmethod
    def _validate_hook_metadata_hex(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith("0x"):
            raise ValueError("SCOUT_EXECUTION_HOOK_METADATA_HEX must start with 0x")
        if len(value) % 2 != 0:
            raise ValueError("SCOUT_EXECUTION_HOOK_METADATA_HEX must have even-length hex bytes")
        if not re.fullmatch(r"0x[a-fA-F0-9]*", value):
            raise ValueError("SCOUT_EXECUTION_HOOK_METADATA_HEX must be valid hex")
        return value

    @field_validator("protocol_address_map")
    @classmethod
    def _validate_protocol_address_map(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return value
        for item in value.split(","):
            entry = item.strip()
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) != 3:
                raise ValueError(
                    f"Invalid SCOUT_PROTOCOL_ADDRESS_MAP item '{entry}'. Expected 'chainId:protocol:0x...'"
                )
            chain_raw, protocol_raw, address_raw = [part.strip() for part in parts]
            if not chain_raw.isdigit():
                raise ValueError(f"Invalid chainId in SCOUT_PROTOCOL_ADDRESS_MAP item '{entry}'")
            if not protocol_raw:
                raise ValueError(f"Missing protocol in SCOUT_PROTOCOL_ADDRESS_MAP item '{entry}'")
            if not Web3.is_address(address_raw):
                raise ValueError(f"Invalid protocol address in SCOUT_PROTOCOL_ADDRESS_MAP item '{entry}'")
        return value

    @field_validator("trusted_remote_map")
    @classmethod
    def _validate_trusted_remote_map(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return value
        for item in value.split(","):
            entry = item.strip()
            if not entry:
                continue
            parts = entry.split(":")
            if len(parts) != 2:
                raise ValueError(f"Invalid HYP_TRUSTED_REMOTES item '{entry}'. Expected 'domain:0x...bytes32'")
            domain_raw, remote_raw = [part.strip() for part in parts]
            if not domain_raw.isdigit():
                raise ValueError(f"Invalid domain in HYP_TRUSTED_REMOTES item '{entry}'")
            if not re.fullmatch(r"0x[a-fA-F0-9]{64}", remote_raw):
                raise ValueError(f"HYP_TRUSTED_REMOTES value must be bytes32 hex in item '{entry}'")
        return value

    @model_validator(mode="after")
    def _validate_routes_and_intents(self) -> "ScoutConfig":
        if self.scout_market_data_provider == "hybrid":
            if not self.defillama_api_base_url or not self.defillama_pools_path:
                raise ValueError("Hybrid market provider requires DEFILLAMA_API_BASE_URL and DEFILLAMA_POOLS_PATH.")
        elif self.scout_market_data_provider == "lucid":
            if not self.lucid_api_base_url or not self.lucid_api_key:
                raise ValueError("Lucid mode requires LUCID_API_BASE_URL and LUCID_API_KEY.")

        routes = self.allowed_route_pairs_set()
        if not self.scout_disable_route_filter and not routes:
            raise ValueError(
                "No allowed route pairs configured. Set SCOUT_ALLOWED_ROUTE_PAIRS, provide a valid artifact path, "
                "or set SCOUT_DISABLE_ROUTE_FILTER=true for demo mode."
            )
        if self.scout_llm_enabled and not self.groq_api_key.strip():
            raise ValueError("SCOUT_LLM_ENABLED=true requires GROQ_API_KEY.")
        if self.execution_intent_enabled:
            if not self.client_agent_vault_address or not self.orca_oapp_address:
                raise ValueError(
                    "Execution intent is enabled; set CLIENT_AGENT_VAULT_ADDRESS and ORCA_OAPP_ADDRESS."
                )
        if self.scout_require_registry:
            if not self.orca_registry_address.strip():
                raise ValueError("SCOUT_REQUIRE_REGISTRY=true requires ORCA_REGISTRY_ADDRESS.")
        return self


class EndpointHealth(BaseModel):
    lucid_ok: bool
    goldsky_ok: bool
    bridge_fee_ok: bool
    x402_ok: bool
    redis_ok: bool
