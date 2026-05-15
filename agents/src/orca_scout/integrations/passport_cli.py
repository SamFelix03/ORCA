from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any


class PassportCLI:
    def __init__(self, kpass_bin: str, timeout_seconds: int = 30) -> None:
        self._kpass_bin = kpass_bin
        self._timeout_seconds = timeout_seconds

    def _run(self, args: list[str]) -> dict[str, Any]:
        try:
            completed = subprocess.run(
                [self._kpass_bin, *args, "--output", "json", "--no-interactive"],
                check=True,
                capture_output=True,
                text=True,
                timeout=self._timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Passport command timed out: {' '.join(exc.cmd)}") from exc
        except FileNotFoundError as exc:
            raise RuntimeError(f"Passport CLI not found: {self._kpass_bin}") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            detail = stderr or stdout or "unknown error"
            raise RuntimeError(f"Passport command failed: {' '.join(exc.cmd)} :: {detail}") from exc
        if not completed.stdout.strip():
            return {}
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Passport CLI returned non-JSON output") from exc

    def check_ready(self) -> None:
        if shutil.which(self._kpass_bin) is None:
            raise RuntimeError(f"Passport CLI binary is not available on PATH: {self._kpass_bin}")
        self._run(["agent:session", "list", "--status", "active"])

    def ensure_active_session(
        self,
        task_summary: str,
        max_per_tx: int,
        max_total: int,
        ttl: str,
        assets: str,
    ) -> str:
        requested_assets = {item.strip().upper() for item in assets.split(",") if item.strip()}

        sessions = self._run(["agent:session", "list", "--status", "active"])
        active = sessions.get("sessions", [])
        if active:
            matching_session_id = self._find_matching_session_id(active, requested_assets)
            if matching_session_id:
                self._run(["agent:session", "use", "--session-id", matching_session_id])
                return matching_session_id

        created = self._run(
            [
                "agent:session",
                "create",
                "--task-summary",
                task_summary,
                "--max-amount-per-tx",
                str(max_per_tx),
                "--max-total-amount",
                str(max_total),
                "--ttl",
                ttl,
                "--assets",
                assets,
                "--payment-approach",
                "x402",
            ]
        )
        request_id = created.get("requestId")
        if request_id:
            self._run(["agent:session", "status", "--request-id", str(request_id), "--wait"])

        refreshed = self._run(["agent:session", "list", "--status", "active"])
        fresh = refreshed.get("sessions", [])
        if not fresh:
            raise RuntimeError("No active Passport session available after creation request.")

        matching_session_id = self._find_matching_session_id(fresh, requested_assets)
        session_id = matching_session_id or self._extract_session_id(fresh[0])
        if not session_id:
            raise RuntimeError("Passport returned active session without sessionId.")
        self._run(["agent:session", "use", "--session-id", str(session_id)])
        return str(session_id)

    @staticmethod
    def _extract_session_id(session: dict[str, Any]) -> str:
        session_id = session.get("sessionId") or session.get("id")
        return str(session_id) if session_id else ""

    def _find_matching_session_id(self, sessions: list[dict[str, Any]], requested_assets: set[str]) -> str:
        if not requested_assets:
            for session in sessions:
                session_id = self._extract_session_id(session)
                if session_id:
                    return session_id
            return ""

        for session in sessions:
            delegation = session.get("delegation")
            policy = delegation.get("payment_policy") if isinstance(delegation, dict) else {}
            assets = policy.get("assets") if isinstance(policy, dict) else []
            session_assets = {
                str(item).strip().upper()
                for item in assets
                if isinstance(item, str) and item.strip()
            }
            if requested_assets.issubset(session_assets):
                session_id = self._extract_session_id(session)
                if session_id:
                    return session_id
        return ""
