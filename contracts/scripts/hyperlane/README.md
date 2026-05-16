# Hyperlane warp scripts (yield USDT vs payments PIEUSD)

Scripts read [`hyperlane/outputs/snapshots/orca-integration.latest.json`](../../../hyperlane/outputs/snapshots/orca-integration.latest.json) (or `HYPERLANE_INTEGRATION_SNAPSHOT`).

## Two tokens — do not conflate them

| Asset | Role | Kite address (testnet) |
|--------|------|-------------------------|
| **USDT** | **Yield / cross-chain collateral** — HypCollateral wraps this; agents and `prepare:sepolia-e2e` use **`HYP_WARP_ASSET=USDT`** (default). | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` |
| **PIEUSD** | **Marketplace & x402 payments only** — not for ORCA yield or RemoteAdapter pull funding. Use **`HYP_WARP_ASSET=PIEUSD`** only if you intentionally smoke the payment token route. | `0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A` |

The integration snapshot holds **both** route families: `USDT/kitetestnet-*` (collateral `0x0fF539…`) and `PIEUSD/kitetestnet-*`.

## OApp / `trustedRemotes` vs warp routers

**`ORCAOApp.trustedRemotes`** must be each spoke **`RemoteAdapter`** (32-byte), **not** `destinationRouter`. Warp routers only move ERC-20; OApp peers message recipients.

## Prerequisites

- `PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY` in `contracts/.env` (funded hub + destination for gas).
- **For USDT routes:** HypCollateral balance of **faucet USDT** on Kite (`0x0fF539…`).
- Optional: `INTERCHAIN_GAS_WEI`, `HYP_WARP_ASSET` (default **`USDT`**).

Use **`pnpm hyperlane:quote`** (`HYP_DEST`, `HYP_WARP_ASSET`, `AMOUNT`, `RECIPIENT`) to print **`quoteTransferRemote`** — native fee must be sent as `msg.value` to `transferRemote` (our `warp.ts` does this automatically when the router supports quoting).

## Root cause (confirmed by `pnpm hyperlane:diagnose`)

| Layer | Status |
|--------|--------|
| USDT route / `routers(domain)` enrollment | OK — matches snapshot |
| `quoteTransferRemote` native fee | `0` at tested amounts |
| Kite `transferRemote` + `DispatchId` | OK |
| Sepolia `ProcessId` for message | **Missing** until something relays |

**Underlying issue:** ORCA Hardhat scripts only perform **origin dispatch**. Hyperlane **delivery** (`Mailbox.process` on the spoke → mint / `RemoteAdapter.handle`) requires the **in-repo ORCA relayer** (`pnpm relayer:start`) or `pnpm relayer:once` / `warp-verify` with `ATTEMPT_RELAY=1`.

## Why `transferRemote` on Kite succeeds but the spoke balance never moves

Hyperlane warp is **two hops**: (1) **origin** lock + mailbox **dispatch** (what Kitescan shows), (2) **destination** `Mailbox.process` / handle → **synthetic mint**. ORCA scripts only perform (1). If (2) never runs, **no funds appear** on the spoke.

| Check | What to verify |
|--------|----------------|
| **IGP / `msg.value`** | Run `pnpm hyperlane:quote`. If **native** quote (`token` = `0x0…0`) is **> 0**, you must pay it — `warp.ts` adds quoted native fee to `transferRemote` `{ value }`. *(Your current USDT Kite→Sepolia quotes showed `0` at tested amounts — so this was not the blocker.)* |
| **Relayer** | Run **`pnpm relayer:start`** in `contracts/` (see [`AGENTIC_FLOW.md`](../../AGENTIC_FLOW.md)). Fund `RELAYER_PRIVATE_KEY` on every destination chain. |
| **ISM on destination** | Spoke **`RemoteAdapter`** must expose **`NoopISM`** via `interchainSecurityModule()` (deployed by `deploy-spoke.ts`). Warp routers may still use mailbox default ISM until warp ISM is configured. |
| **Warp enrollment** | After `warp deploy`, **enrolling cross-chain routers** must finish; a half-enrolled route can strand messages. |

Public **Hyperlane Explorer** often **does not index Kite**; use **`pnpm decode:kite-warp-tx`** for **DispatchId** / message id, then CLI relay or your relayer logs.

## Commands (from `contracts/`)

| Script | Network flag | Env |
|--------|----------------|-----|
| `pnpm hyperlane:quote` | `--network kiteTestnet` | `HYP_DEST`, `HYP_WARP_ASSET`, `AMOUNT`, optional `RECIPIENT` — prints `quoteTransferRemote` (native + token pull) |
| `pnpm decode:kite-warp-tx` | `--network kiteTestnet` | `KITE_WARP_TX` — extracts **DispatchId** (message id) + decodes `SentTransferRemote` / `Dispatch` for delivery debugging ([Hyperlane message debugging](https://docs.hyperlane.xyz/docs/resources/message-debugging)) |
| `npm run hyperlane:balances` | `--network kiteTestnet` | `HYP_DEST`, optional `RECIPIENT`, **`HYP_WARP_ASSET`** (default USDT) |
| `npm run hyperlane:transfer:hub` | `--network kiteTestnet` | `HYP_DEST`, `AMOUNT`, optional `RECIPIENT`, `HYP_WARP_ASSET`, `INTERCHAIN_GAS_WEI` |
| `hyperlane:transfer:dest` | `--network` = destination | same |
| `npm run test:hyperlane:smoke` | `--network kiteTestnet` | `RUN_TRANSFER=1`, `AMOUNT` |

Examples (PowerShell):

```powershell
cd contracts
$env:HYP_DEST="sepolia"
$env:HYP_WARP_ASSET="USDT"
npm run hyperlane:balances
$env:AMOUNT="1000000000000000000"
npm run hyperlane:transfer:hub
```

Destination → hub (Base Sepolia example):

```powershell
$env:HYP_DEST="basesepolia"
$env:HYP_WARP_ASSET="USDT"
$env:AMOUNT="1000000000000000000"
npx hardhat run scripts/hyperlane/transfer-dest-to-hub.ts --network baseSepolia
```
