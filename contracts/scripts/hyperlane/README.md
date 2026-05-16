# Hyperlane smoke scripts (PIEUSD warp routes)

These Hardhat scripts read [`hyperlane/outputs/snapshots/orca-integration.latest.json`](../../../hyperlane/outputs/snapshots/orca-integration.latest.json) (or `HYPERLANE_INTEGRATION_SNAPSHOT`) and exercise the **existing PIEUSD** hub ↔ L2 testnet warp routes from the ORCA integration export.

## PIEUSD vs your Kite faucet USDT

- **PIEUSD (in the snapshot):** Hub token address `0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A` on Kite with per-route `originRouter` / `destinationRouter`. Use these scripts to prove relayers, `transferRemote`, and balance deltas.
- **Your faucet USDT:** Per the hackathon manifest, hub underlying may be `ORCA_UNDERLYING_TOKEN` (Kite USDT). Automated bridging of that asset requires **its own warp route** and liquidity on each spoke; until then, fund spoke USDT manually or deploy a second warp following [`hyperlane/multichain_setup.md`](../../../hyperlane/multichain_setup.md).

## OApp / `trustedRemotes` vs warp routers

**`ORCAOApp.trustedRemotes`** must be the **`RemoteAdapter`** on each destination (32-byte padded address), **not** `destinationRouter` from the warp snapshot. Warp routers only move fungible tokens; the OApp peers LayerZero/Hyperlane message recipients. See `contracts/.env.example`.

## Prerequisites

- `PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY` in `contracts/.env` (funded on **hub + destination** for gas).
- PIEUSD (or destination synthetic) balance on the chain you send from.
- Optional: `INTERCHAIN_GAS_WEI` if your deployment charges native fees on `transferRemote`.

## Commands (from `contracts/`)

| Script | Network flag | Env |
|--------|----------------|-----|
| `npm run hyperlane:balances` | `--network kiteTestnet` | `HYP_DEST` (default `basesepolia`), optional `RECIPIENT` |
| `npm run hyperlane:transfer:hub` | `--network kiteTestnet` | `HYP_DEST`, `AMOUNT` (wei), optional `RECIPIENT`, `INTERCHAIN_GAS_WEI` |
| `hyperlane:transfer:dest` | **Change** `--network` to match `HYP_DEST` (e.g. `baseSepolia`) | same |
| `npm run test:hyperlane:smoke` | `--network kiteTestnet` | `RUN_TRANSFER=1` and `AMOUNT` to also submit hub→dest |

Examples (PowerShell):

```powershell
cd contracts
$env:HYP_DEST="basesepolia"
npm run hyperlane:balances
$env:AMOUNT="1000000000000000000"
npm run hyperlane:transfer:hub
```

Destination → hub (Base Sepolia example):

```powershell
$env:HYP_DEST="basesepolia"
$env:AMOUNT="1000000000000000000"
npx hardhat run scripts/hyperlane/transfer-dest-to-hub.ts --network baseSepolia
```
