# ORCA agentic flow (multi-terminal)

Run from repo root unless noted. Requires `contracts/.env` with `DEPLOYER_PRIVATE_KEY` funded on Kite + all four testnet spokes.

## One-time setup (after code changes)

```powershell
cd contracts
pnpm install
cd relayer
pnpm install
cd ..
pnpm build
pnpm deploy:spokes:all
pnpm hyperlane:wire-trust
pnpm sync:spoke-config
```

Copy `HYP_TRUSTED_REMOTES=...` from `sync:spoke-config` output into `agents/.env` if needed.

If Base Sepolia deploy hit RPC rate limits, retry later:

```powershell
$env:ORCA_UNDERLYING_TOKEN="0x2eD22aA87C87E4B0139552d50CB5B049E369C295"
$env:ORCA_SPOKE_MAILBOX="0x68e89453029DC14351bF72104dC30248BB766b69"
$env:DEPLOY_TX_DELAY_MS="6000"
pnpm exec hardhat run scripts/deploy-spoke.ts --network baseSepolia
pnpm hyperlane:wire-trust
pnpm sync:spoke-config
```

```powershell
pnpm verify:spoke-ism
HYP_DEST=sepolia pnpm prepare:spoke-e2e
```

## Terminal 1 — ORCA relayer (keep running)

```powershell
cd contracts
pnpm relayer:start
```

Delivers Kite mailbox messages to Sepolia / Arb / OP / Base for ORCA `RemoteAdapter` and USDT warp routers.

**Live flow:** executor or `transferRemote` on Kite → wait for `[delivered] <chain>` in this terminal (poll every `RELAYER_POLL_MS`, default 8s). `[skip] already delivered` is normal for old traffic; set `RELAYER_LOG_SKIPS=0` (default) to hide it.

**Immediate delivery for one warp** (relayer need not be running):

```powershell
$env:KITE_WARP_TX="0x..."   # Kite transferRemote tx hash
pnpm relayer:once
```

## Terminal 2 — API

```powershell
cd api
pnpm install
pnpm dev
```

## Terminal 3 — Frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

## Terminal 4 — Agents (Risk + Scout + Executor)

```powershell
cd agents
pnpm install
# Ensure .env: KITE_RPC_URL, HYP_TRUSTED_REMOTES, ORCA_RELAYER_ENABLED=1 (relayer on T1)
pnpm dev
```

## Smoke cross-chain (contracts only)

With Terminal 1 relayer running:

```powershell
cd contracts
pnpm hyperlane:warp-verify
pnpm e2e:orca-sepolia
```

## Debug one message

```powershell
cd contracts
pnpm relayer:inspect -- --dispatch-tx 0xYOUR_KITE_TX
pnpm relayer:once -- --dispatch-tx 0xYOUR_KITE_TX
```
