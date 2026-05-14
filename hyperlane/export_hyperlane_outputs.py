#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


def read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main() -> None:
    repo_hyperlane_dir = Path(__file__).resolve().parent
    out_dir = repo_hyperlane_dir / "outputs" / "snapshots"
    out_dir.mkdir(parents=True, exist_ok=True)

    configured_home = os.getenv("HYPERLANE_HOME", "").strip()
    home_hyperlane_dir = Path(configured_home) if configured_home else Path.home() / ".hyperlane"
    chains_dir = home_hyperlane_dir / "chains"
    warp_routes_dir = home_hyperlane_dir / "deployments" / "warp_routes"

    exported: dict[str, Any] = {
        "schemaVersion": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "chains": {},
        "warpRoutes": {},
    }

    if chains_dir.exists():
        for chain_dir in sorted(chains_dir.iterdir()):
            if not chain_dir.is_dir():
                continue
            name = chain_dir.name
            exported["chains"][name] = {
                "metadata": read_yaml(chain_dir / "metadata.yaml"),
                "addresses": read_yaml(chain_dir / "addresses.yaml"),
            }

    if warp_routes_dir.exists():
        for route_dir in sorted(warp_routes_dir.iterdir()):
            if not route_dir.is_dir():
                continue
            route_name = route_dir.name
            exported["warpRoutes"][route_name] = {}
            for file in sorted(route_dir.glob("*.yaml")):
                exported["warpRoutes"][route_name][file.name] = read_yaml(file)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_file = out_dir / f"hyperlane-outputs-{timestamp}.json"
    out_file.write_text(json.dumps(exported, indent=2), encoding="utf-8")
    print(f"Using Hyperlane home: {home_hyperlane_dir}")
    print(f"Exported Hyperlane outputs to: {out_file}")


if __name__ == "__main__":
    main()
