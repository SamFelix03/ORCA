from __future__ import annotations

import json
import logging
import time
from decimal import Decimal
from pathlib import Path

from web3 import Web3

from orca_scout.models import ProtocolName, YieldMarket

_STUB_APY_ABI = [
    {
        "name": "apyBps",
        "outputs": [{"type": "uint256", "name": ""}],
        "stateMutability": "view",
        "type": "function",
    }
]

_CHAIN_NAMES: dict[int, str] = {
    2368: "kite-testnet",
    11155111: "sepolia",
    421614: "arbitrum-sepolia",
    11155420: "optimism-sepolia",
    84532: "base-sepolia",
}


class StubVaultMarketFeed:
    """Load stub vault addresses from manifest and read on-chain `apyBps` per chain."""

    def __init__(self, manifest_path: str, chain_rpc_map: dict[int, str]) -> None:
        self._manifest_path = Path(manifest_path).expanduser()
        self._chain_rpc_map = chain_rpc_map
        self._logger = logging.getLogger("orca_scout.stub_vault_market_feed")

    async def fetch_markets(self) -> list[YieldMarket]:
        if not self._manifest_path.is_file():
            raise FileNotFoundError(f"Stub manifest not found: {self._manifest_path}")
        payload = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        stubs = payload.get("stubsByChainId")
        if not isinstance(stubs, dict):
            raise ValueError("Stub manifest missing stubsByChainId")

        markets: list[YieldMarket] = []
        now = int(time.time())
        for chain_key, protocols in stubs.items():
            chain_id = int(str(chain_key).strip())
            rpc = self._chain_rpc_map.get(chain_id)
            if not rpc:
                self._logger.warning("No RPC in SCOUT_STUB_CHAIN_RPC_MAP for chainId=%s; skipping", chain_id)
                continue
            w3 = Web3(Web3.HTTPProvider(rpc))
            if not w3.is_connected():
                raise RuntimeError(f"Stub feed: Web3 not connected for chainId={chain_id}")

            if not isinstance(protocols, dict):
                continue

            for proto_raw, addr_raw in protocols.items():
                proto = str(proto_raw).strip()
                if proto not in ("aave-v3", "compound-v3", "morpho", "uniswap-v3"):
                    continue
                addr = str(addr_raw).strip()
                if not Web3.is_address(addr):
                    continue
                protocol: ProtocolName = proto  # type: ignore[assignment]
                c = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=_STUB_APY_ABI)
                apy_bps = int(c.functions.apyBps().call())
                apy = Decimal(apy_bps) / Decimal(100)
                markets.append(
                    YieldMarket(
                        chain_id=chain_id,
                        chain_name=_CHAIN_NAMES.get(chain_id, str(chain_id)),
                        protocol=protocol,
                        apy=apy,
                        tvl_usdc=Decimal(1),
                        utilization=Decimal(0),
                        timestamp=now,
                    )
                )

        self._logger.info("Stub vault market feed: markets=%d", len(markets))
        return markets

    async def close(self) -> None:
        return
