from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from orca_common.agent_config import (
    apply_agent_config_defaults,
    chain_rpc_by_chain_id_to_csv,
    default_agent_config_path,
    get_hyperlane_env_field,
    load_agent_config,
    resolve_agent_path,
    to_env_defaults,
    trusted_remotes_csv,
    trusted_remotes_from_collateral_manifest,
)


@pytest.fixture
def agents_root() -> Path:
    return Path(__file__).resolve().parents[1]


@pytest.fixture
def minimal_agents_json(tmp_path: Path) -> Path:
    snap = tmp_path / "snap.json"
    snap.write_text(
        json.dumps(
            {
                "env": {
                    "HYP_TRUSTED_REMOTES": "421614:0xabc",
                    "SCOUT_ALLOWED_ROUTE_PAIRS": "2368:421614",
                }
            }
        ),
        encoding="utf-8",
    )
    coll = tmp_path / "collateral.json"
    coll.write_text(
        json.dumps(
            {
                "remoteAdapterByChainId": {
                    "421614": "0x4e4D20D7bc954FDe4C447a21255B9eD39cfAb938",
                    "11155111": "0xa171fdeDC284Cfe3c0e00A808fCD427729C39a05",
                }
            }
        ),
        encoding="utf-8",
    )
    cfg = {
        "schemaVersion": 1,
        "network": "kite-testnet",
        "kiteChainId": 2368,
        "deployments": {
            "poai": "0x" + "11" * 20,
            "clientAgentVault": "0x" + "22" * 20,
            "orcaOApp": "0x" + "33" * 20,
            "orcaRegistry": "0x" + "44" * 20,
            "spendingRuleEnforcer": "0x" + "55" * 20,
            "lzBridgeGuard": "0x" + "66" * 20,
            "pieUsd": "0x" + "77" * 20,
        },
        "paths": {
            "hyperlaneIntegrationSnapshot": str(snap.name),
            "stubProtocolManifest": "config/orca-stub-protocols.json",
            "collateralManifest": str(coll.name),
            "contractsDir": "../contracts",
        },
        "chainRpcByChainId": {"421614": "https://example-rpc.test"},
        "hyperlane": {"warpAsset": "USDT"},
        "scout": {
            "scanIntervalSeconds": 30,
            "minNetDeltaApy": 0.05,
            "defaultSuggestedAmount": "100",
            "maxSuggestedAmount": "200",
            "marketDataProvider": "hybrid",
            "opportunityMode": "rebalance",
            "executionIntentEnabled": True,
        },
        "executor": {
            "submitVaultTx": True,
            "crossChainMode": "warp_to_stub",
            "deterministicRouting": True,
            "autoBridge": False,
            "bridgeWaitSeconds": 60,
        },
        "risk": {"maxApyDriftBps": 50, "maxUtilization": 0.95},
        "x402": {
            "executionMode": "direct",
            "maxAmountRequiredWei": "1000",
            "network": "kite-testnet",
        },
        "policy": {
            "spendingMaxPerTx": "500",
            "bridgeGuardThresholdUsdc": "50000",
        },
    }
    path = tmp_path / "orca.agents.json"
    path.write_text(json.dumps(cfg), encoding="utf-8")
    return path


def test_load_committed_example(agents_root: Path) -> None:
    cfg = load_agent_config(agents_root / "config" / "orca.agents.example.json", base=agents_root)
    assert cfg is not None
    assert cfg.kite_chain_id == 2368
    assert cfg.deployments.poai.startswith("0x")


def test_snapshot_env_field(agents_root: Path) -> None:
    snap = resolve_agent_path(
        "../hyperlane/outputs/snapshots/orca-integration.latest.json",
        agents_root,
    )
    remotes = get_hyperlane_env_field(snap, "HYP_TRUSTED_REMOTES")
    assert "421614:" in remotes
    pairs = get_hyperlane_env_field(snap, "SCOUT_ALLOWED_ROUTE_PAIRS")
    assert "2368:11155111" in pairs


def test_trusted_remotes_from_snapshot_then_collateral(tmp_path: Path) -> None:
    snap = tmp_path / "hyperlane_snap.json"
    snap.write_text('{"env": {"HYP_TRUSTED_REMOTES": "421614:0xfromsnap"}}', encoding="utf-8")
    coll = tmp_path / "coll.json"
    coll.write_text(
        json.dumps({"remoteAdapterByChainId": {"84532": "0x" + "aa" * 20}}),
        encoding="utf-8",
    )
    assert trusted_remotes_csv(snap, coll) == "421614:0xfromsnap"

    empty_snap = tmp_path / "empty_snap.json"
    empty_snap.write_text("{}", encoding="utf-8")
    built = trusted_remotes_from_collateral_manifest(coll, hub_chain_id=2368)
    assert "84532:" in built


def test_to_env_defaults_includes_snapshot_fields(
    agents_root: Path, minimal_agents_json: Path
) -> None:
    cfg = load_agent_config(minimal_agents_json, base=minimal_agents_json.parent)
    assert cfg is not None
    defaults = to_env_defaults(cfg, base=minimal_agents_json.parent)
    assert defaults["POAI_CONTRACT_ADDRESS"] == cfg.deployments.poai
    assert defaults["HYP_TRUSTED_REMOTES"] == "421614:0xabc"
    assert defaults["SCOUT_ALLOWED_ROUTE_PAIRS"] == "2368:421614"
    assert "421614:https://example-rpc.test" in defaults["SCOUT_STUB_CHAIN_RPC_MAP"]


def test_apply_respects_env_override(
    agents_root: Path, minimal_agents_json: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("POAI_CONTRACT_ADDRESS", raising=False)
    monkeypatch.setenv("ORCA_AGENTS_CONFIG", str(minimal_agents_json))
    apply_agent_config_defaults(minimal_agents_json.parent)
    assert os.environ["HYP_TRUSTED_REMOTES"] == "421614:0xabc"

    monkeypatch.setenv("POAI_CONTRACT_ADDRESS", "0xoverride")
    apply_agent_config_defaults(minimal_agents_json.parent)
    assert os.environ["POAI_CONTRACT_ADDRESS"] == "0xoverride"


def test_missing_config_file_is_noop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("POAI_CONTRACT_ADDRESS", raising=False)
    monkeypatch.setenv("ORCA_AGENTS_CONFIG", str(tmp_path / "missing.json"))
    apply_agent_config_defaults(tmp_path)
    assert "POAI_CONTRACT_ADDRESS" not in os.environ


def test_default_config_path(agents_root: Path) -> None:
    assert default_agent_config_path(agents_root).name == "orca.agents.json"


def test_chain_rpc_csv() -> None:
    csv = chain_rpc_by_chain_id_to_csv({"84532": "https://b", "421614": "https://a"})
    assert csv == "84532:https://b,421614:https://a"
