"""Load static ORCA agent settings from ``config/orca.agents.json`` with env fallback."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def agents_dir() -> Path:
    return Path(__file__).resolve().parents[2]


def default_agent_config_path(base: Path | None = None) -> Path:
    root = base if base is not None else agents_dir()
    return root / "config" / "orca.agents.json"


def resolve_agent_path(path_str: str, base: Path | None = None) -> Path:
    raw = path_str.strip()
    if not raw:
        return Path()
    p = Path(raw).expanduser()
    if p.is_absolute():
        return p.resolve()
    root = base if base is not None else agents_dir()
    return (root / p).resolve()


class DeploymentsSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    poai: str
    client_agent_vault: str = Field(alias="clientAgentVault")
    orca_oapp: str = Field(alias="orcaOApp")
    orca_registry: str = Field(alias="orcaRegistry")
    spending_rule_enforcer: str = Field(alias="spendingRuleEnforcer")
    lz_bridge_guard: str = Field(alias="lzBridgeGuard")
    pie_usd: str = Field(alias="pieUsd")


class PathsSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hyperlane_integration_snapshot: str = Field(alias="hyperlaneIntegrationSnapshot")
    stub_protocol_manifest: str = Field(alias="stubProtocolManifest")
    collateral_manifest: str = Field(alias="collateralManifest")
    contracts_dir: str = Field(alias="contractsDir")


class HyperlaneSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    warp_asset: str = Field(default="USDT", alias="warpAsset")


class ScoutSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scan_interval_seconds: int = Field(default=300, alias="scanIntervalSeconds")
    min_net_delta_apy: float = Field(default=0.5, alias="minNetDeltaApy")
    default_suggested_amount: str = Field(alias="defaultSuggestedAmount")
    max_suggested_amount: str = Field(alias="maxSuggestedAmount")
    market_data_provider: str = Field(default="hybrid", alias="marketDataProvider")
    opportunity_mode: str = Field(default="rebalance", alias="opportunityMode")
    execution_intent_enabled: bool = Field(default=True, alias="executionIntentEnabled")


class ExecutorSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    submit_vault_tx: bool = Field(default=False, alias="submitVaultTx")
    cross_chain_mode: str = Field(default="warp_to_stub", alias="crossChainMode")
    deterministic_routing: bool = Field(default=True, alias="deterministicRouting")
    auto_bridge: bool = Field(default=False, alias="autoBridge")
    bridge_wait_seconds: int = Field(default=60, alias="bridgeWaitSeconds")


class RiskSection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    max_apy_drift_bps: int = Field(default=50, alias="maxApyDriftBps")
    max_utilization: float = Field(default=0.95, alias="maxUtilization")


class X402Section(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    execution_mode: str = Field(default="direct", alias="executionMode")
    max_amount_required_wei: str = Field(alias="maxAmountRequiredWei")
    network: str = Field(default="kite-testnet")


class PolicySection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    spending_max_per_tx: str = Field(alias="spendingMaxPerTx")
    bridge_guard_threshold_usdc: str = Field(alias="bridgeGuardThresholdUsdc")


class OrcaAgentsFile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: int = Field(alias="schemaVersion")
    network: str = ""
    kite_chain_id: int = Field(alias="kiteChainId")
    deployments: DeploymentsSection
    paths: PathsSection
    chain_rpc_by_chain_id: dict[str, str] = Field(default_factory=dict, alias="chainRpcByChainId")
    hyperlane: HyperlaneSection = Field(default_factory=HyperlaneSection)
    scout: ScoutSection
    executor: ExecutorSection
    risk: RiskSection
    x402: X402Section
    policy: PolicySection


def load_agent_config(path: Path | None = None, *, base: Path | None = None) -> OrcaAgentsFile | None:
    root = base if base is not None else agents_dir()
    cfg_path = path
    if cfg_path is None:
        override = os.environ.get("ORCA_AGENTS_CONFIG", "").strip()
        cfg_path = Path(override) if override else default_agent_config_path(root)
    else:
        cfg_path = Path(cfg_path)
    if not cfg_path.is_file():
        return None
    payload = json.loads(cfg_path.read_text(encoding="utf-8"))
    return OrcaAgentsFile.model_validate(payload)


def get_hyperlane_env_field(snapshot_path: Path, name: str) -> str:
    if not snapshot_path.is_file():
        return ""
    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    env_block = payload.get("env")
    if not isinstance(env_block, dict):
        return ""
    return str(env_block.get(name, "") or "").strip()


def trusted_remotes_from_collateral_manifest(collateral_path: Path, *, hub_chain_id: int = 2368) -> str:
    if not collateral_path.is_file():
        return ""
    try:
        payload = json.loads(collateral_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    adapters = payload.get("remoteAdapterByChainId")
    if not isinstance(adapters, dict):
        return ""
    parts: list[str] = []
    for chain_key, addr in sorted(adapters.items(), key=lambda kv: int(str(kv[0]))):
        chain_id = int(str(chain_key).strip())
        if chain_id == hub_chain_id:
            continue
        address = str(addr).strip()
        if not address:
            continue
        parts.append(f"{chain_id}:{address}")
    return ",".join(parts)


def trusted_remotes_csv(
    snapshot_path: Path,
    collateral_path: Path | None = None,
    *,
    hub_chain_id: int = 2368,
) -> str:
    from_snapshot = get_hyperlane_env_field(snapshot_path, "HYP_TRUSTED_REMOTES")
    if from_snapshot:
        return from_snapshot
    if collateral_path is not None:
        return trusted_remotes_from_collateral_manifest(collateral_path, hub_chain_id=hub_chain_id)
    return ""


def chain_rpc_by_chain_id_to_csv(chain_rpc: dict[str, str]) -> str:
    if not chain_rpc:
        return ""
    items = sorted(chain_rpc.items(), key=lambda kv: int(str(kv[0])))
    return ",".join(f"{chain_id}:{url}" for chain_id, url in items)


def _env_set(key: str) -> bool:
    return bool(os.environ.get(key, "").strip())


def _set_env_if_missing(key: str, value: str) -> None:
    if value and not _env_set(key):
        os.environ[key] = value


def _bool_env(value: bool) -> str:
    return "1" if value else "0"


def resolve_trusted_remotes(
    routes_artifact_path: str,
    *,
    collateral_manifest_path: str = "",
    hub_chain_id: int = 2368,
    base: Path | None = None,
) -> str:
    root = base if base is not None else agents_dir()
    snap = resolve_agent_path(routes_artifact_path, root) if routes_artifact_path.strip() else Path()
    coll = (
        resolve_agent_path(collateral_manifest_path, root)
        if collateral_manifest_path.strip()
        else Path()
    )
    if not snap.is_file() and not coll.is_file():
        return ""
    return trusted_remotes_csv(snap, coll if coll.is_file() else None, hub_chain_id=hub_chain_id)


def to_env_defaults(cfg: OrcaAgentsFile, base: Path | None = None) -> dict[str, str]:
    root = base if base is not None else agents_dir()
    d = cfg.deployments
    p = cfg.paths
    snap_rel = p.hyperlane_integration_snapshot.strip()
    snap_abs = resolve_agent_path(snap_rel, root) if snap_rel else Path()
    coll_rel = p.collateral_manifest.strip()
    coll_abs = resolve_agent_path(coll_rel, root) if coll_rel else Path()

    out: dict[str, str] = {
        "KITE_CHAIN_ID": str(cfg.kite_chain_id),
        "POAI_CONTRACT_ADDRESS": d.poai,
        "CLIENT_AGENT_VAULT_ADDRESS": d.client_agent_vault,
        "ORCA_OAPP_ADDRESS": d.orca_oapp,
        "ORCA_REGISTRY_ADDRESS": d.orca_registry,
        "SPENDING_RULE_ENFORCER_ADDRESS": d.spending_rule_enforcer,
        "LZ_BRIDGE_GUARD_ADDRESS": d.lz_bridge_guard,
        "X402_ASSET_ADDRESS": d.pie_usd,
        "ORCA_STUB_PROTOCOL_MANIFEST_PATH": p.stub_protocol_manifest.strip(),
        "EXECUTOR_COLLATERAL_MANIFEST_PATH": coll_rel,
        "EXECUTOR_CONTRACTS_DIR": p.contracts_dir.strip(),
        "HYPERLANE_INTEGRATION_SNAPSHOT": snap_rel,
        "SCOUT_ROUTES_ARTIFACT_PATH": snap_rel,
        "HYP_WARP_ASSET": cfg.hyperlane.warp_asset,
        "SCAN_INTERVAL_SECONDS": str(cfg.scout.scan_interval_seconds),
        "SCOUT_MIN_NET_DELTA_APY": str(cfg.scout.min_net_delta_apy),
        "SCOUT_DEFAULT_SUGGESTED_AMOUNT": cfg.scout.default_suggested_amount,
        "SCOUT_MAX_SUGGESTED_AMOUNT": cfg.scout.max_suggested_amount,
        "SCOUT_MARKET_DATA_PROVIDER": cfg.scout.market_data_provider,
        "SCOUT_OPPORTUNITY_MODE": cfg.scout.opportunity_mode,
        "SCOUT_EXECUTION_INTENT_ENABLED": _bool_env(cfg.scout.execution_intent_enabled),
        "EXECUTOR_SUBMIT_VAULT_TX": _bool_env(cfg.executor.submit_vault_tx),
        "EXECUTOR_CROSS_CHAIN_MODE": cfg.executor.cross_chain_mode,
        "EXECUTOR_DETERMINISTIC_ROUTING": _bool_env(cfg.executor.deterministic_routing),
        "EXECUTOR_AUTO_BRIDGE": _bool_env(cfg.executor.auto_bridge),
        "EXECUTOR_BRIDGE_WAIT_SECONDS": str(cfg.executor.bridge_wait_seconds),
        "RISK_MAX_APY_DRIFT_BPS": str(cfg.risk.max_apy_drift_bps),
        "RISK_MAX_UTILIZATION": str(cfg.risk.max_utilization),
        "X402_EXECUTION_MODE": cfg.x402.execution_mode,
        "X402_MAX_AMOUNT_REQUIRED_WEI": cfg.x402.max_amount_required_wei,
        "X402_NETWORK": cfg.x402.network,
        "SPENDING_MAX_PER_TX": cfg.policy.spending_max_per_tx,
        "BRIDGE_GUARD_THRESHOLD_USDC": cfg.policy.bridge_guard_threshold_usdc,
    }

    rpc_csv = chain_rpc_by_chain_id_to_csv(cfg.chain_rpc_by_chain_id)
    if rpc_csv:
        out["SCOUT_STUB_CHAIN_RPC_MAP"] = rpc_csv
        out["EXECUTOR_STUB_CHAIN_RPC_MAP"] = rpc_csv

    if snap_abs.is_file():
        route_pairs = get_hyperlane_env_field(snap_abs, "SCOUT_ALLOWED_ROUTE_PAIRS")
        if route_pairs:
            out["SCOUT_ALLOWED_ROUTE_PAIRS"] = route_pairs
        remotes = trusted_remotes_csv(snap_abs, coll_abs if coll_abs.is_file() else None, hub_chain_id=cfg.kite_chain_id)
        if remotes:
            out["HYP_TRUSTED_REMOTES"] = remotes

    return out


def apply_agent_config_defaults(base: Path | None = None) -> None:
    """Fill unset ``os.environ`` keys from ``orca.agents.json``; existing env always wins."""
    cfg = load_agent_config(base=base)
    if cfg is None:
        return
    for key, value in to_env_defaults(cfg, base=base).items():
        _set_env_if_missing(key, value)


def merge_settings_with_agent_config(data: Any, *, base: Path | None = None) -> Any:
    """Optional Pydantic ``mode='before'`` merge when ``load_agents_dotenv`` was not called."""
    if not isinstance(data, dict):
        return data
    cfg = load_agent_config(base=base)
    if cfg is None:
        return data
    merged = dict(data)
    for env_key, config_val in to_env_defaults(cfg, base=base).items():
        if _env_set(env_key):
            continue
        if env_key not in merged or merged.get(env_key) in (None, ""):
            merged[env_key] = config_val
    return merged
