from __future__ import annotations

import asyncio
import json
import subprocess
from typing import Any, Literal

from tenacity import retry, stop_after_attempt, wait_exponential

from orca_scout.integrations.x402_direct_execute import X402DirectExecutor


class X402Client:
    def __init__(
        self,
        service_url: str,
        execute_path: str,
        kpass_bin: str = "kpass",
        timeout_seconds: float = 30.0,
        *,
        dry_run: bool = False,
        passport_base_url: str = "",
        execution_mode: Literal["passport", "direct"] = "passport",
        signer_private_key: str = "",
        facilitator_address: str = "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
        rpc_url: str = "",
        chain_id: int = 2368,
        token_name_fallback: str = "pieUSD",
        token_version_fallback: str = "1",
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self._execute_path = execute_path
        self._kpass_bin = kpass_bin
        self._timeout_seconds = timeout_seconds
        self._dry_run = dry_run
        self._passport_base_url = passport_base_url.strip()
        self._execution_mode = execution_mode
        self._direct_executor: X402DirectExecutor | None = None
        if self._execution_mode == "direct":
            if not signer_private_key.strip():
                raise RuntimeError("X402 direct mode requires signer private key")
            self._direct_executor = X402DirectExecutor(
                rpc_url=rpc_url,
                chain_id=chain_id,
                signer_private_key=signer_private_key,
                facilitator_address=facilitator_address,
                token_name_fallback=token_name_fallback,
                token_version_fallback=token_version_fallback,
                timeout_seconds=timeout_seconds,
            )

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
        if self._passport_base_url:
            command.extend(["--base-url", self._passport_base_url])
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
        if self._execution_mode == "direct":
            resource_url = self._build_resource_url()
            if not resource_url:
                raise RuntimeError("X402_SERVICE_URL is required for direct x402 mode.")
            if self._direct_executor is None:
                raise RuntimeError("Direct x402 executor was not initialized.")
            raw = await self._direct_executor.execute(resource_url=resource_url, payload=payload)
        else:
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
        if self._direct_executor is not None:
            await self._direct_executor.close()
        return None
