#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def latest_snapshot(snapshots_dir: Path) -> Path:
    files = sorted(snapshots_dir.glob("hyperlane-outputs-*.json"))
    if not files:
        raise FileNotFoundError(f"No hyperlane snapshots found in {snapshots_dir}")
    return files[-1]


def normalize_address(address: str) -> str:
    if not isinstance(address, str) or not address.startswith("0x"):
        raise ValueError(f"Invalid address: {address}")
    return address


def to_bytes32(address: str) -> str:
    addr = normalize_address(address).lower().replace("0x", "")
    if len(addr) == 40:
        return "0x" + ("0" * 24) + addr
    if len(addr) == 64:
        return "0x" + addr
    raise ValueError(f"Address is neither 20-byte nor 32-byte hex: {address}")


def pick_token_route(snapshot: dict[str, Any], route_id: str) -> dict[str, Any]:
    route_suffix = route_id.split("/", 1)[1]
    for token_name, entries in snapshot.get("warpRoutes", {}).items():
        deploy_key = f"{route_suffix}-deploy.yaml"
        config_key = f"{route_suffix}-config.yaml"
        if deploy_key in entries and config_key in entries:
            return {
                "tokenGroup": token_name,
                "deploy": entries[deploy_key],
                "config": entries[config_key],
            }
    raise KeyError(f"Route not found in snapshot: {route_id}")


def snapshot_is_usable(snapshot: dict[str, Any], destinations: list[str]) -> bool:
    hub = "kitetestnet"
    required_chains = [hub, *destinations]
    try:
        for chain in required_chains:
            entry = snapshot["chains"][chain]
            if not entry["addresses"].get("mailbox"):
                return False
        route_ids = [f"USDT/{hub}-{dest}" for dest in destinations]
        for route_id in route_ids:
            pick_token_route(snapshot, route_id)
    except Exception:
        return False
    return True


def resolve_snapshot_file(snapshots_dir: Path, destinations: list[str]) -> Path:
    explicit = os.getenv("ORCA_HYPERLANE_SNAPSHOT", "").strip()
    if explicit:
        snap = Path(explicit)
        if not snap.is_absolute():
            snap = snapshots_dir / snap
        if not snap.exists():
            raise FileNotFoundError(f"ORCA_HYPERLANE_SNAPSHOT not found: {snap}")
        return snap

    files = sorted(snapshots_dir.glob("hyperlane-outputs-*.json"), reverse=True)
    for file in files:
        snapshot = json.loads(file.read_text(encoding="utf-8"))
        if snapshot_is_usable(snapshot, destinations):
            return file

    raise RuntimeError("No usable hyperlane snapshot found with required chains/routes. Set ORCA_HYPERLANE_SNAPSHOT.")


def main() -> None:
    root = Path(__file__).resolve().parent
    snapshots_dir = root / "outputs" / "snapshots"
    out_dir = root / "outputs" / "snapshots"
    out_dir.mkdir(parents=True, exist_ok=True)

    kite = "kitetestnet"
    destinations = ["sepolia", "arbitrumsepolia", "optimismsepolia", "basesepolia"]
    snap_file = resolve_snapshot_file(snapshots_dir, destinations)
    snapshot = json.loads(snap_file.read_text(encoding="utf-8"))
    route_ids = [f"USDT/{kite}-{dest}" for dest in destinations]

    domain_by_chain: dict[str, int] = {}
    mailbox_by_chain: dict[str, str] = {}
    for chain_name in [kite, *destinations]:
        chain = snapshot["chains"][chain_name]
        domain_by_chain[chain_name] = int(chain["metadata"]["domainId"])
        mailbox_by_chain[chain_name] = chain["addresses"]["mailbox"]

    routes: dict[str, Any] = {}
    trusted_remotes: list[str] = []
    trusted_senders: list[str] = []
    for route_id in route_ids:
        route_data = pick_token_route(snapshot, route_id)
        deploy = route_data["deploy"]
        cfg = route_data["config"]
        dest = route_id.split("-")[-1]

        origin_router = cfg["tokens"][0]["addressOrDenom"]
        destination_router = cfg["tokens"][1]["addressOrDenom"]
        origin_domain = domain_by_chain[kite]
        destination_domain = domain_by_chain[dest]

        routes[route_id] = {
            "origin": kite,
            "destination": dest,
            "originDomain": origin_domain,
            "destinationDomain": destination_domain,
            "originMailbox": deploy[kite]["mailbox"],
            "destinationMailbox": deploy[dest]["mailbox"],
            "originRouter": origin_router,
            "destinationRouter": destination_router,
            "originRouterBytes32": to_bytes32(origin_router),
            "destinationRouterBytes32": to_bytes32(destination_router),
            "token": deploy[kite]["token"],
        }
        trusted_remotes.append(f"{destination_domain}:{destination_router}")
        trusted_senders.append(f"{destination_domain}:{destination_router}")

    artifact = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceSnapshot": snap_file.name,
        "hubChain": kite,
        "domains": domain_by_chain,
        "mailboxes": mailbox_by_chain,
        "routes": routes,
        "env": {
            "HYP_TRUSTED_REMOTES": ",".join(trusted_remotes),
            "HYP_TRUSTED_SENDERS": ",".join(trusted_senders),
            "SCOUT_ALLOWED_ROUTE_PAIRS": ",".join(
                f"{domain_by_chain[kite]}:{domain_by_chain[dest]}" for dest in destinations
            ),
        },
    }

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_file = out_dir / f"orca-integration-{stamp}.json"
    out_file.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    latest_file = out_dir / "orca-integration.latest.json"
    latest_file.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(f"Wrote ORCA integration artifact: {out_file}")
    print(f"Updated latest artifact: {latest_file}")


if __name__ == "__main__":
    main()
