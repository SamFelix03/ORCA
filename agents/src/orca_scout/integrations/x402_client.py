from __future__ import annotations

import asyncio
import json
import subprocess
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential


class X402Client:
    def __init__(
        self,
        service_url: str,
        execute_path: str,
        kpass_bin: str = "kpass",
        timeout_seconds: float = 30.0,
        *,
        dry_run: bool = False,
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self._execute_path = execute_path
        self._kpass_bin = kpass_bin
        self._timeout_seconds = timeout_seconds
        self._dry_run = dry_run

    def _build_resource_url(self) -> str:
        if not self._service_url:
            return ""
        path = self._execute_path.strip()
        if not path:
            return self._service_url
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self._service_url}{path}"

    def _run_execute(self, payload: dict[str, Any]) -> dict[str, Any]:
        command = [
            self._kpass_bin,
            "agent:session",
            "execute",
        ]
        resource_url = self._build_resource_url()
        if not resource_url:
            raise RuntimeError(
                "X402_SERVICE_URL is required for this kpass version. "
                "Set X402_SERVICE_URL (and optionally X402_EXECUTE_PATH) in .env."
            )
        command.extend(
            [
                "--url",
                resource_url,
                "--method",
                "POST",
                "--headers",
                json.dumps({"Content-Type": "application/json"}),
                "--body",
                json.dumps(payload),
            ]
        )
        command.extend(["--output", "json", "--no-interactive"])
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=self._timeout_seconds,
            check=False,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout).strip()
            raise RuntimeError(f"kpass agent:session execute failed: {detail}")
        stdout = completed.stdout.strip()
        if not stdout:
            return {}
        try:
            return json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("kpass execute returned non-JSON output") from exc

    @staticmethod
    def _extract_tx_hash(payload: dict[str, Any]) -> str:
        direct = payload.get("txHash")
        if isinstance(direct, str) and direct:
            return direct
        body = payload.get("body")
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except json.JSONDecodeError:
                body = {}
        if isinstance(body, dict):
            for key in ("txHash", "paymentTxHash"):
                value = body.get(key)
                if isinstance(value, str) and value:
                    return value
            payment = body.get("payment")
            if isinstance(payment, dict):
                value = payment.get("txHash")
                if isinstance(value, str) and value:
                    return value
        return ""

    async def _execute_paid_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        raw = await asyncio.to_thread(self._run_execute, payload)
        tx_hash = self._extract_tx_hash(raw)
        if not tx_hash:
            raise RuntimeError("x402 execute response missing txHash; strict mode requires payment transaction hash")
        return {"txHash": tx_hash, "raw": raw}

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def send_micropayment(
        self,
        to_did: str,
        amount_wei: int,
        network: str,
        asset_address: str,
        signal_id: str,
    ) -> dict[str, Any]:
        payload = {
            "toDid": to_did,
            "amountWei": str(amount_wei),
            "network": network,
            "asset": asset_address,
            "memo": f"signal:{signal_id}",
        }
        if self._dry_run:
            return {
                "txHash": "0x" + "11" * 32,
                "raw": {"dryRun": True, "payload": payload},
            }
        return await self._execute_paid_request(payload)

    async def close(self) -> None:
        return None
