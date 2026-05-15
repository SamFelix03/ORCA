#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from eth_account import Account


DEFAULT_BASE_URL = "https://passport.dev.gokite.ai"
DEFAULT_DROPS_PER_WALLET = 1
SCRIPT_PATH = Path(__file__).resolve()
AGENTS_DIR = SCRIPT_PATH.parents[1]
REPO_ROOT = SCRIPT_PATH.parents[2]
DEFAULT_ENV_PATH = REPO_ROOT / "agents/.env"
DEFAULT_KPASS_CONFIG_PATH = REPO_ROOT / ".kite-passport/config.json"


TOKEN_KEY_CANDIDATES = (
    "token_name",
    "token",
    "tokenName",
    "tokenname",
)


@dataclass
class DropResult:
    recipient: str
    ok: bool
    tx_hash: str = ""
    token_field: str = ""
    raw_response: dict[str, Any] | None = None
    error: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fund wallet addresses via Kite Passport dev faucet API.",
    )
    parser.add_argument(
        "--token",
        required=True,
        help="Token symbol to request from faucet (examples: PIEUSD, USDC).",
    )
    parser.add_argument(
        "--recipient",
        action="append",
        default=[],
        help="Recipient wallet address. Repeat flag for multiple addresses.",
    )
    parser.add_argument(
        "--agents-env",
        default=str(DEFAULT_ENV_PATH),
        help="Path to agents .env for extracting SCOUT/RISK/EXECUTOR/AUDIT private keys.",
    )
    parser.add_argument(
        "--use-agent-wallets",
        action="store_true",
        help="Auto-fund Scout/Risk/Executor/Audit wallet addresses from private keys in --agents-env.",
    )
    parser.add_argument(
        "--drops-per-wallet",
        type=int,
        default=DEFAULT_DROPS_PER_WALLET,
        help="How many faucet drop requests to submit per wallet.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("KITE_PASSPORT_BASE_URL", DEFAULT_BASE_URL),
        help="Passport base URL.",
    )
    parser.add_argument(
        "--kpass-config",
        default=str(DEFAULT_KPASS_CONFIG_PATH),
        help="Path to .kite-passport/config.json (used for JWT).",
    )
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jwt(kpass_config_path: Path) -> str:
    if not kpass_config_path.exists():
        raise RuntimeError(f"kpass config not found: {kpass_config_path}")
    payload = read_json(kpass_config_path)
    token = str(payload.get("jwt", "")).strip()
    if not token:
        raise RuntimeError(f"No JWT found in: {kpass_config_path}")
    return token


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise RuntimeError(f".env file not found: {path}")
    data: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def resolve_agent_wallets(agents_env_path: Path) -> list[str]:
    env = parse_env_file(agents_env_path)
    keys = [
        "SCOUT_PRIVATE_KEY",
        "RISK_PRIVATE_KEY",
        "EXECUTOR_PRIVATE_KEY",
        "AUDIT_PRIVATE_KEY",
    ]
    recipients: list[str] = []
    for key_name in keys:
        raw_key = env.get(key_name, "").strip()
        if not raw_key:
            continue
        account = Account.from_key(raw_key)
        recipients.append(account.address)
    return recipients


def post_json(url: str, jwt: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    encoded = json.dumps(payload).encode("utf-8")
    req = Request(url=url, data=encoded, method="POST")
    req.add_header("Authorization", f"Bearer {jwt}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=30) as res:
            status = res.getcode()
            body = res.read().decode("utf-8")
            parsed = json.loads(body) if body.strip() else {}
            if not isinstance(parsed, dict):
                parsed = {"raw": parsed}
            return status, parsed
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw.strip() else {}
            if not isinstance(parsed, dict):
                parsed = {"raw": parsed}
        except Exception:
            parsed = {"raw": raw}
        return exc.code, parsed
    except URLError as exc:
        return 0, {"error": f"network_error: {exc}"}


def try_drop(base_url: str, jwt: str, recipient: str, token: str) -> DropResult:
    faucet_url = f"{base_url.rstrip('/')}/v1/faucet/drop"
    last_response: dict[str, Any] | None = None
    for token_key in TOKEN_KEY_CANDIDATES:
        body = {
            "recipient": recipient,
            token_key: token,
        }
        status, response = post_json(faucet_url, jwt, body)
        last_response = response
        error_text = str(response.get("error", "")).strip().lower()
        if "unsupported asset" in error_text:
            return DropResult(
                recipient=recipient,
                ok=False,
                token_field=token_key,
                raw_response=response,
                error="unsupported asset for this faucet environment",
            )
        tx_hash = str(
            (
                response.get("data", {}).get("transaction_hash")
                if isinstance(response.get("data"), dict)
                else ""
            )
            or response.get("transaction_hash", "")
            or ""
        ).strip()
        if status == 200 and tx_hash.startswith("0x"):
            return DropResult(
                recipient=recipient,
                ok=True,
                tx_hash=tx_hash,
                token_field=token_key,
                raw_response=response,
            )
    return DropResult(
        recipient=recipient,
        ok=False,
        raw_response=last_response,
        error=f"faucet drop failed for all token keys: {', '.join(TOKEN_KEY_CANDIDATES)}",
    )


def main() -> int:
    args = parse_args()
    if args.drops_per_wallet < 1:
        print("--drops-per-wallet must be >= 1", file=sys.stderr)
        return 2

    recipients = list(args.recipient)
    if args.use_agent_wallets:
        recipients.extend(resolve_agent_wallets(Path(args.agents_env)))
    recipients = sorted(set(addr.strip() for addr in recipients if addr.strip()))

    if not recipients:
        print("No recipients provided. Use --recipient and/or --use-agent-wallets.", file=sys.stderr)
        return 2

    jwt = load_jwt(Path(args.kpass_config))
    token = args.token.strip()
    if not token:
        print("--token cannot be empty", file=sys.stderr)
        return 2

    all_results: list[DropResult] = []
    for recipient in recipients:
        for _ in range(args.drops_per_wallet):
            result = try_drop(args.base_url, jwt, recipient, token)
            all_results.append(result)

    ok_count = sum(1 for item in all_results if item.ok)
    fail_count = len(all_results) - ok_count

    for item in all_results:
        if item.ok:
            print(
                f"ok recipient={item.recipient} token={token} field={item.token_field} tx={item.tx_hash}"
            )
        else:
            print(
                f"fail recipient={item.recipient} token={token} error={item.error} raw={json.dumps(item.raw_response or {})}"
            )

    print(f"summary token={token} ok={ok_count} failed={fail_count}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
