# ORCA — full local setup

This guide walks through setting up the **entire ORCA stack** on your machine: infrastructure, API, frontend, four Python agents, x402 micropayments, and (optionally) contracts / Hyperlane relayer. It consolidates steps from `README.md`, package READMEs, `docs/envs.md`, `docs/x402.md`, and the repo’s config layout.

**Target network:** Kite testnet (chain ID **2368**) with Sepolia-family spoke stubs. Contract addresses for testnet are already committed in JSON config files; you mainly supply **secrets**, **RPC URLs**, and **API keys**.

---

## What you are running

| Component | Path | Role |
|-----------|------|------|
| **Frontend** | `frontend/` | Next.js dashboard (signals, marketplace, wallet via Privy) — dev port **3001** |
| **API** | `api/` | Fastify REST + WebSocket; ingests Redis agent streams into Postgres |
| **Agents** | `agents/` | Scout, Risk, Executor, Audit (Python 3.11+, Groq LLM) |
| **x402 provider** | `services/x402-provider/` | HTTP 402 + `/execute` for inter-agent micropayments |
| **Contracts** | `contracts/` | Hardhat project + in-repo Hyperlane relayer (optional locally) |
| **Postgres + Redis** | `infra/docker-compose.yml` | Persistence and agent stream bus |

```mermaid
flowchart LR
  UI[Frontend_3001] --> API[API_4000]
  API --> PG[(Postgres)]
  API --> Redis[(Redis)]
  Scout --> Redis
  Risk --> Redis
  Exec[Executor] --> Redis
  Audit --> Redis
  Scout --> X402[x402_8099]
  Risk --> X402
  Exec --> X402
  Scout --> Kite[Kite_RPC]
  Exec --> Kite
```

**Market data:** Scout uses **DefiLlama** (hybrid mode) for yield APY — no Goldsky indexer required. Optional protocol enrichers and bridge-fee APIs are documented below.

---

## 1. Prerequisites

Install these before cloning:

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | 20+ |
| **pnpm** | **10.19.0** (see root `package.json` `packageManager`) — enable via `corepack enable` |
| **Python** | **3.11+** for agents |
| **Docker Desktop** | For Postgres + Redis (`pnpm db:up` / `pnpm db:setup`) — optional if you run Postgres/Redis elsewhere |
| **Git** | Clone this repo |
| **Groq API key** | Required for all four agents (`GROQ_API_KEY`) — [console.groq.com](https://console.groq.com) |
| **Kite Passport CLI** | `kpass` — agent DIDs and spending sessions — [Kite Passport docs](https://docs.gokite.ai/kite-agent-passport/cli-reference) |
| **Privy app** | For frontend login — create an app at [dashboard.privy.io](https://dashboard.privy.io) |

**Optional (cross-chain / deploy):**

- Funded **Kite testnet** wallet(s) with gas — [faucet](https://faucet.gokite.ai)
- `DEPLOYER_PRIVATE_KEY` in `contracts/.env` only if you deploy contracts or run the relayer
- Hyperlane / spoke gas on Sepolia-family chains for warp tests

**Windows:** Use PowerShell. For agents, prefer a venv under `agents/.venv`. If `pnpm install` skips lifecycle scripts, run `pnpm approve-builds` or reinstall so Prisma native binaries build correctly (`docs/envs.md`).

---

## 2. Clone and install the monorepo

```bash
git clone <your-orca-repo-url>
cd ORCA
pnpm install
```

Workspace packages: `frontend`, `api`, `agents`, `contracts`, `services/x402-provider`, `packages/*`.

Generate the API Prisma client (also runs on `api` build):

```bash
pnpm --dir api prisma:generate
```

---

## 3. Configuration model (read this once)

ORCA splits settings into **secrets / environment** (`.env`) and **static testnet defaults** (JSON). **`.env` always wins** when both define the same variable.

| Package | Secrets (`.env`) | Static defaults (JSON) |
|---------|------------------|-------------------------|
| **agents** | `agents/.env` ← copy from `agents/.env.example` | `agents/config/orca.agents.json` |
| **api** | `api/.env` ← copy from `api/.env.example` | `api/config/orca.api.json` |
| **contracts** | `contracts/.env` ← copy from `contracts/.env.example` | `contracts/config/orca.contracts.json` |
| **x402** | `services/x402-provider/.env` | `services/x402-provider/.env.example` |
| **frontend** | `frontend/.env` | `frontend/.env.example` (+ Privy IDs) |

Override JSON path with:

- `ORCA_AGENTS_CONFIG` (agents)
- `ORCA_API_CONFIG` (api)
- `ORCA_CONTRACTS_CONFIG` (contracts)

At startup, loaders apply JSON values only for **unset** env keys (see `orca_common/agents_env.py`, `api/src/load-env.ts`, `contracts/scripts/lib/load-contracts-env.ts`).

**Critical:** Use the **same** `ORCA_INTERNAL_API_KEY` in `agents/.env` and `api/.env` so internal routes (`/internal/risk-context`, deliberation persistence) work.

---

## 4. Infrastructure — Postgres and Redis

From repo root:

```bash
pnpm db:setup
```

This:

1. Starts **Postgres** (`localhost:5432`, user `orca`, password `pass`, db `orca`) and **Redis** (`localhost:6379`) via Docker.
2. Runs `prisma migrate deploy` against `api/prisma/schema.prisma`.

If Docker is unavailable, start Postgres/Redis yourself and run:

```bash
pnpm db:up          # docker only
pnpm db:migrate     # migrations only
```

Set `api/.env`:

```env
DATABASE_URL=postgresql://orca:pass@localhost:5432/orca
REDIS_URL=redis://localhost:6379
```

**Strict API mode (default):** `STRICT_MODE=true` requires `JWT_SECRET` and `WEBHOOK_SECRET` — set long random strings in `api/.env` (see section 5).

---

## 5. API setup

```bash
cp api/.env.example api/.env
```

Fill **required** values:

```env
WEBHOOK_SECRET=<long-random-string>
JWT_SECRET=<long-random-string>
ORCA_INTERNAL_API_KEY=orca-dev-internal

DATABASE_URL=postgresql://orca:pass@localhost:5432/orca
REDIS_URL=redis://localhost:6379
KITE_RPC_URL=https://rpc-testnet.gokite.ai
```

Deployments, CORS (`http://localhost:3000,http://localhost:3001`), marketplace token addresses, and stub manifest paths default from `api/config/orca.api.json`.

**Run API:**

```bash
pnpm dev:api
# listens on http://localhost:4000
```

**Verify:**

```bash
curl http://localhost:4000/health
pnpm test:api
```

**Optional DB seed / marketplace:** From `api/`, `pnpm db:seed`. For Scout marketplace purchases, ensure Prisma schema is applied (`pnpm prisma:push` or migrate) so `ScoutPurchase` exists (`agents/README.md`).

---

## 6. Frontend setup

```bash
cp frontend/.env.example frontend/.env
```

Minimum:

```env
NEXT_PUBLIC_ORCA_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_ORCA_WS_URL=ws://localhost:4000/ws
```

**Privy (required for wallet UI):** Add from your Privy dashboard:

```env
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
NEXT_PUBLIC_PRIVY_CLIENT_ID=<optional-client-id>
```

Without `NEXT_PUBLIC_PRIVY_APP_ID`, the app shows a configuration error (`frontend/src/components/providers/orca-web3-provider.tsx`).

**Run frontend:**

```bash
pnpm dev:frontend
# http://localhost:3001  (see frontend/package.json)
```

Or from root: `pnpm dev` starts **API + frontend** in parallel (not agents).

```bash
pnpm lint:frontend   # optional
```

---

## 7. x402 provider (agent micropayments)

Agents pay each other via HTTP 402. Point all agents at a local provider:

**`agents/.env`:**

```env
X402_SERVICE_URL=http://127.0.0.1:8099
X402_EXECUTE_PATH=/execute
X402_DRY_RUN=false
```

**Stub mode (easiest dev):** No Pieverse settlement — synthetic `txHash` after `X-Payment`.

```bash
cp services/x402-provider/.env.example services/x402-provider/.env
```

```env
PUBLIC_RESOURCE_URL=http://127.0.0.1:8099/execute
X402_PROVIDER_STUB=true
X402_ASSET_ADDRESS=0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A
```

```bash
pnpm dev:x402-provider
```

**Live Pieverse settlement:** Set `X402_PROVIDER_STUB=false`, set `X402_PAY_TO`, align `PUBLIC_RESOURCE_URL` with agents’ full `/execute` URL. If `kpass` cannot use localhost, tunnel with [ngrok](https://ngrok.com/) and update both URLs. Details: `services/x402-provider/README.md`, `docs/x402.md`.

**Skip HTTP x402 entirely (dev only):** `X402_DRY_RUN=true` in `agents/.env` — agents simulate payment hashes without calling the provider.

---

## 8. Agents setup (Scout, Risk, Executor, Audit)

### 8.1 Python environment

```bash
cd agents
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -e ".[dev]"
```

### 8.2 Environment file

```bash
cp .env.example .env
```

Fill **required** fields (see `agents/.env.example`):

| Variable | Purpose |
|----------|---------|
| `SCOUT_DID`, `RISK_AGENT_DID`, `EXECUTOR_AGENT_DID`, `AUDIT_AGENT_DID` | Passport DIDs (`did:kite:orca/...`) |
| `SCOUT_PRIVATE_KEY`, `RISK_PRIVATE_KEY`, `EXECUTOR_PRIVATE_KEY`, `AUDIT_PRIVATE_KEY` | `0x` + 64 hex chars per agent EOA |
| `GROQ_API_KEY` | LLM for all agents |
| `REDIS_URL` | Same as API (`redis://localhost:6379`) |
| `KITE_RPC_URL` | Kite testnet RPC |
| `ORCA_API_BASE_URL` | `http://127.0.0.1:4000` |
| `ORCA_INTERNAL_API_KEY` | Must match `api/.env` |
| `X402_SERVICE_URL` | e.g. `http://127.0.0.1:8099` unless `X402_DRY_RUN=true` |
| `KITE_PASSPORT_BASE_URL` | e.g. `https://passport.dev.gokite.ai` |
| `PASSPORT_CLI_BIN` | `kpass` |
| `SCOUT_CROSS_CHAIN_BENEFICIARY` | Wallet credited on spoke after warp→stub |

Static values (addresses, Hyperlane paths, scout tuning, x402 asset, route pairs) load from `agents/config/orca.agents.json`. `HYP_TRUSTED_REMOTES` and `SCOUT_ALLOWED_ROUTE_PAIRS` can be derived from `hyperlane/outputs/snapshots/orca-integration.latest.json` when not set in `.env`.

**Do not** put `DATABASE_URL`, `JWT_SECRET`, or `WEBHOOK_SECRET` in `agents/.env` — duplicate or empty `REDIS_URL` entries have caused startup failures.

### 8.3 Kite Passport (`kpass`)

1. Install and authenticate per [Kite Passport beginner setup](https://docs.gokite.ai/kite-agent-passport/beginner-setup).
2. Create agent identities matching your DIDs in `.env`.
3. Create **spending sessions** for Scout, Risk, and Executor (Audit receives payment; sessions needed for payers).

Agents use `X402_EXECUTION_MODE=direct` by default (from config) for internal micropayments without full Passport discovery on every call.

### 8.4 Run agents (four terminals)

Always run from `agents/` so `.env` and relative paths resolve:

```bash
cd agents
orca-scout      # or: python -m orca_scout.main
orca-risk       # python -m orca_risk.main
orca-executor   # python -m orca_executor.main
orca-audit      # python -m orca_audit.main
```

**Healthy Scout cycle logs:** `Redis preflight OK`, `Passport CLI preflight OK`, `Kite RPC preflight OK`, `Published signal_id=...`.

**Tests:**

```bash
cd agents
python -m pytest tests -q
# or from root: pnpm test:agents
```

Full agent checklist: `agents/README.md` (execution intents, `best_stub_deposit` mode, marketplace binding).

---
