# ORCA Agents

This package contains the Scout Agent implementation for ORCA (`AG-01`, modules `SC-01` to `SC-06`).

## Stack

- Python 3.11+
- `asyncio`, `httpx`, `redis`, `web3`, `eth-account`
- LangChain dependency included for future reasoning/tool extensions

## Install

```bash
cd agents
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Windows PowerShell:

```powershell
cd agents
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

## Configure

Copy `.env.example` to `.env` and fill **secrets and environment-specific URLs** (private keys, DIDs, `REDIS_URL`, `KITE_RPC_URL`, Groq, x402, Passport, beneficiary wallet).

**Static testnet settings** (contract addresses, Hyperlane paths, stub RPC map, scout/executor/risk tuning) live in [`config/orca.agents.json`](config/orca.agents.json). Copy [`config/orca.agents.example.json`](config/orca.agents.example.json) when bootstrapping a new network. At startup, `load_agents_dotenv()` loads `.env` first, then fills any **unset** variables from that JSON. Existing `.env` values always win. Optional override: `ORCA_AGENTS_CONFIG=/path/to/custom.json`.

`HYP_TRUSTED_REMOTES` and `SCOUT_ALLOWED_ROUTE_PAIRS` are derived from the Hyperlane integration snapshot (`paths.hyperlaneIntegrationSnapshot`) when not set in `.env`.

Do **not** append API-only variables (`DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET`) here: if `REDIS_URL` is set twice, the later empty value overrides the real URL and agents crash at startup.

- Market data providers (`SCOUT_MARKET_DATA_PROVIDER`, `DEFILLAMA_*`, optional protocol enrichers)
- Legacy Lucid fallback (`LUCID_*`, only if provider mode is `lucid`)
- Bridge quote provider (`BRIDGE_FEE_*`, optional; defaults to 0 bridge cost when unset)
- Mandatory Groq LLM on all four agents (`GROQ_API_KEY`, `GROQ_*`); chain-of-thought persisted via API/Postgres and shown in Signals workflow UI
- Risk agent re-fetches DefiLlama/enricher/bridge data and calls `GET /internal/risk-context` before LLM verdict

### LLM setup (required)

1. Copy `agents/.env.example` → `agents/.env` and set `GROQ_API_KEY`.
2. Set matching internal auth in API: `ORCA_INTERNAL_API_KEY` in `api/.env` (same value as agents).
3. From repo root: `pnpm db:up` then `pnpm db:migrate` (Postgres + LLM deliberation tables).
4. Run tests: `pnpm test:agents` and `pnpm test:api`.
- Passport CLI + session policy (`PASSPORT_*`)
- x402 config (`X402_*`; run `pnpm dev:x402-provider` for a local `/execute` URL, or `X402_DRY_RUN=true` without HTTP — see `services/x402-provider/README.md`)
  - `X402_EXECUTION_MODE=direct` uses the ORCA direct executor utility and skips Passport discovery allowlisting for internal micropayment rails.
  - `X402_EXECUTION_MODE=passport` keeps `kpass agent:session execute` behavior.
- Kite chain + PoAI contract (`KITE_RPC_URL` in `.env`; `KITE_CHAIN_ID` / `POAI_CONTRACT_ADDRESS` default from `orca.agents.json`, optional `POAI_MAX_FEE_GWEI` / `POAI_PRIORITY_FEE_GWEI` if you hit replacement-underpriced with a shared signer)
- Allowed Hyperlane route pairs (from snapshot via config, or `SCOUT_ALLOWED_ROUTE_PAIRS` override)
- Optional route artifact override (`SCOUT_ROUTES_ARTIFACT_PATH`)
- Risk / Executor / Audit (`RISK_PRIVATE_KEY`, `EXECUTOR_AGENT_DID`, `EXECUTOR_PRIVATE_KEY`, `AUDIT_AGENT_DID`, `AUDIT_PRIVATE_KEY`; see `.env.example` stream keys)

- Optional **`SCOUT_OPPORTUNITY_MODE=best_stub_deposit`**: ranks **DefiLlama / Lucid** APY against stub manifest slots (with mainnet→testnet chain remap); see **Best stub deposit mode** below.

Additional execution-intent requirements (when `SCOUT_EXECUTION_INTENT_ENABLED=true`; defaults from `orca.agents.json` + stub manifest):

- `CLIENT_AGENT_VAULT_ADDRESS`, `ORCA_OAPP_ADDRESS` (in config `deployments`)
- `ORCA_STUB_PROTOCOL_MANIFEST_PATH` or `SCOUT_PROTOCOL_ADDRESS_MAP` (`chainId:protocol:0xAddress`)
- `HYP_TRUSTED_REMOTES` (from Hyperlane snapshot `env` block, or override in `.env`)

## Preflight Checklist (Before Run)

- Redis reachable at `REDIS_URL` (`PING` works).
- `kpass` is installed and callable from `PASSPORT_CLI_BIN`.
- `KITE_RPC_URL` is reachable.
- Scout private key wallet has gas on Kite testnet.
- `POAI_CONTRACT_ADDRESS` is deployed and writable by the Scout signer.
- Lucid/Goldsky/x402 credentials are valid.
- If `BRIDGE_FEE_API_BASE_URL` and `BRIDGE_FEE_API_KEY` are unset, Scout runs with 0 bridge-cost deduction.
- If `SCOUT_MARKET_DATA_PROVIDER=hybrid`, DefiLlama endpoint is reachable and enrichment provider URLs are set where available.
- If using artifact route auto-load, `SCOUT_ROUTES_ARTIFACT_PATH` exists.
- If using execution intents, protocol map + trusted remotes are fully populated (`HYP_TRUSTED_REMOTES` must use RemoteAdapter bytes32 per domain).
- Optional: `EXECUTOR_SUBMIT_VAULT_TX=true` to submit `ClientAgentVault.execute` calldata on Kite when processing Risk instructions.

## Run Scout

```bash
# run from the agents directory so .env + relative artifact path resolve correctly
cd agents
python -m orca_scout.main
```

or:

```bash
orca-scout
```

## Run Risk, Executor, Audit

From `agents/` with `.env` filled (including `REDIS_URL`, keys, and DIDs):

```bash
orca-risk
orca-executor
orca-audit
```

or `python -m orca_risk.main`, etc.

## Marketplace purchase / creator-run Scout

Buyers can **purchase** access to a marketplace-listed scout for a fixed **PIEUSD** price (default **1 PIEUSD** = `1_000_000` base units, configurable on the API). Payment is a direct **ERC-20 `transfer`** to the listing’s `ownerAddress`; the API verifies the tx and returns a **`purchaseId`** and one-time **`bindingSecret`**.

| Role | Runs | Redis / streams | Notes |
|------|------|-----------------|--------|
| **Buyer** | Risk, Executor, Audit | Buyer’s `REDIS_URL`; Risk reads `SCOUT_REDIS_STREAM_KEY` / `RISK_INSTRUCTION_STREAM_KEY` | Set **`RISK_SCOUT_DID_ALLOWLIST`** to the **exact scout DID** from the listing so only that scout’s signals are approved. |
| **Creator** | `orca-scout` | Creator’s own `REDIS_URL` (local preflight) + buyer’s Redis for **signal `XADD` only** when in subscriber mode | Uses the real **`SCOUT_DID`** / keys for that listing; Passport/x402 still on creator side for micropayments to Risk. |

**Buyer (after purchase in the app):**

1. Call **`PUT /scouts/purchases/:purchaseId/binding`** with `buyerWallet`, `redisUrl`, optional `scoutSignalStreamKey`, and `bindingSecret`.
2. Set **`RISK_SCOUT_DID_ALLOWLIST=<listing DID>`** in Risk’s `.env`.

**Creator (subscriber mode — all required together):**

- `SCOUT_PURCHASE_ID` — id returned at purchase confirm.
- `SCOUT_BINDING_SECRET` — share securely from buyer; sent as header **`X-Orca-Binding-Secret`** to the API (not query string).
- **`SCOUT_BINDING_API_BASE`** — ORCA API base URL for binding fetch only (not `ORCA_API_BASE_URL`; that is for Risk/Executor/Audit in the same `.env`).

The Scout **polls** `GET /scouts/purchases/:id/binding` until the buyer has stored a Redis URL, then uses **that** Redis client for **`SignalBroadcaster`** (`XADD` to the bound stream key, default `orca:signals:scout`). The creator’s `REDIS_URL` is still used for local preflight and any other scout-internal needs.

**API env (operations):** `PIEUSD_TOKEN_ADDRESS`, optional `PIEUSD_PURCHASE_PRICE_WEI`, `KITE_RPC_URL` / `KITE_CHAIN_ID` for receipt verification.

**Apply DB changes:** from `api/`, run `pnpm prisma:push` (or `prisma migrate dev`) so the **`ScoutPurchase`** table exists.

## Module Map

- `SC-01`: `services/yield_scanner.py` + DefiLlama / Lucid market feeds
- `SC-02`: `services/bridge_cost_estimator.py` + `integrations/bridge_fee_client.py`
- `SC-03`: `services/opportunity_ranker.py`
- `SC-04`: `services/signal_broadcaster.py` + `integrations/x402_client.py`
- `SC-05`: `services/passport_signer.py` + `integrations/passport_cli.py`
- `SC-06`: `services/poai_reporter.py` + `integrations/poai_client.py`

## Execution Intent Payloads

Scout now emits execution-ready payloads (optional, enabled by default) inside each signal:

- `execution_intent.oapp_calldata`: ABI-encoded call for `ORCAOApp.executeCrossChainRebalance(...)`
- `execution_intent.vault_execute_calldata`: ABI-encoded call for `ClientAgentVault.execute(...)`

These are controlled by:

- `SCOUT_EXECUTION_INTENT_ENABLED`
- `CLIENT_AGENT_VAULT_ADDRESS`
- `ORCA_OAPP_ADDRESS`
- `SCOUT_PROTOCOL_ADDRESS_MAP` (`chainId:protocol:address` CSV) **or** `ORCA_STUB_PROTOCOL_MANIFEST_PATH` (JSON `stubsByChainId`, protocol keys: `aave-v3`, `compound-v3`, `morpho`, `uniswap-v3`)
- `SCOUT_CROSS_CHAIN_BENEFICIARY` (optional; defaults to vault address for `executeCrossChainRebalance`)
- `HYP_TRUSTED_REMOTES` (**required** when intents enabled): each entry is `domain:0x` + 64 hex (`RemoteAdapter` on that domain, **not** warp `destinationRouter` from the Hyperlane export)
- `KITE_RPC_URL` — for **cross-chain** intents Scout calls **`quoteCrossChainRebalanceDispatchFee`** on the hub `ORCAOApp` so `tx_value_wei` covers Hyperlane **`Mailbox.dispatch`** fees. **`SCOUT_EXECUTION_TX_VALUE_WEI`** is a floor (extra buffer). This requires hub contracts that implement quoting + payable dispatch (redeploy if your OApp predates that change).

Executor on-chain path (hackathon):

- Set `EXECUTOR_SUBMIT_VAULT_TX=true` to broadcast `vault_execute_calldata` from the executor EOA (gas + vault permissions required). When false, the executor only records PoAI attribution + x402 (legacy demo).

### Best stub deposit mode (Scout + executor, single control wallet)

Demo assumption: the **executor EOA** is the same address as **`SCOUT_CROSS_CHAIN_BENEFICIARY`** (or you leave beneficiary empty so it defaults to the executor). Otherwise the executor cannot sign Kite warp transfers, spoke **`approve(RemoteAdapter)`**, or satisfy **`transferFrom(beneficiary, …)`** on the spoke adapter.

**Scout — feed-ranked execution targets**

- `SCOUT_OPPORTUNITY_MODE=best_stub_deposit` uses the same market provider as rebalance mode: **`SCOUT_MARKET_DATA_PROVIDER=hybrid`** (DefiLlama + enrichers) or **`lucid`**. Signals use **real feed APY** for the winning slot; on-chain **stub** addresses come only from the manifest.
- `ORCA_STUB_PROTOCOL_MANIFEST_PATH` — JSON `stubsByChainId` (see `agents/config/orca-stub-protocols.json`). Only `(chain, protocol)` pairs listed here are eligible execution targets.
- **Chain remap**: feed pools on **mainnets** are mapped to your testnet stubs by default: Ethereum `1`→Sepolia `11155111`, Arbitrum `42161`→`421614`, Optimism `10`→`11155420`, Base `8453`→`84532`. Pools already on a manifest chain (e.g. Kite `2368`, Sepolia) use **identity** (no remap). Override with **`SCOUT_FEED_TO_STUB_CHAIN_MAP`** CSV `feedChainId:stubChainId,...` (merged on top of defaults).
- **`SCOUT_STUB_APY_FALLBACK`** (default `true`): if no feed rows map to the manifest (e.g. TVL filter too high), Scout logs a warning and ranks by on-chain **`apyBps`** on stubs (requires **`SCOUT_STUB_CHAIN_RPC_MAP`**). Set to `false` for feed-only behavior; then ensure **`DEFILLAMA_MIN_TVL_USD`** is low enough that pools appear, or use Lucid data that includes your chains.

**Caveat:** The signal’s `target_apy` reflects the **feed** (often mainnet), while execution goes to the **stub** on the testnet lane. That matches “monitor real markets, act on testnet stand-ins,” not “stub APY equals mainnet.”

**Ranker** picks the single best eligible `(execution_chain, protocol)` by feed APY. **Kite win**: `execution_intent.kite_stub_*` for same-chain deposit. **Spoke win**: vault / OApp calldata unchanged.

**Executor**

- `EXECUTOR_SUBMIT_VAULT_TX=true`
- Optional **`EXECUTOR_AUTO_BRIDGE=1`**: before the vault tx, run Hardhat `scripts/hyperlane/transfer-hub-to-dest.ts` on **Kite** with `HYP_DEST` derived from the winning `dst_chain`, `AMOUNT=suggested_amount`, `RECIPIENT=SCOUT_CROSS_CHAIN_BENEFICIARY` (or executor EOA). Set **`HYPERLANE_INTEGRATION_SNAPSHOT`** to a file whose `routes` include your warp asset (see **`HYP_WARP_ASSET`**, default `USDT` on the executor — must match snapshot keys, e.g. `USDT/kitetestnet-sepolia`).
- **`EXECUTOR_BRIDGE_WAIT_SECONDS`** — sleep after warp (default 60); tune per chain.
- **`EXECUTOR_CONTRACTS_DIR`** — Hardhat project root (default `contracts`); run the executor **from repo root** or set an absolute path.
- **`EXECUTOR_COLLATERAL_MANIFEST_PATH`** — defaults to `contracts/config/orca-collateral.manifest.json` (used for spoke **collateral token** + **RemoteAdapter** spender for `approve`).
- **`EXECUTOR_STUB_CHAIN_RPC_MAP`** — optional; if empty the executor reuses **`SCOUT_STUB_CHAIN_RPC_MAP`** from the environment for spoke RPC.
- **Smoke-test (estimateGas only):** from `agents/`, run `python scripts/smoke_executor_vault.py` using the same `.env` as Scout/executor. It builds an `ExecutionIntent` like the Scout and calls `eth_estimateGas` on `vault_execute_calldata` (add `--broadcast` to send a real tx). Use `--src-chain`, `--dst-chain`, `--amount`, and protocol flags to mirror the route under test.

**Approvals**

- **Kite stub deposit**: beneficiary must **`approve(stub, amount)`** (or max approve once) on the Kite collateral token the stub uses.
- **Spoke path**: beneficiary must **`approve(RemoteAdapter, amount)`** on the spoke **synthetic USDT** (collateral addresses are in the manifest). The executor submits `approve` from the same private key when `EXECUTOR_SUBMIT_VAULT_TX=true`.

**Amounts / decimals**

- `SCOUT_DEFAULT_SUGGESTED_AMOUNT` / `SCOUT_MAX_SUGGESTED_AMOUNT` are passed through as the **raw `uint256`** to `deposit`, Hyperlane `AMOUNT`, and OApp `amount`. They are **not** USD-scaled in code — set them to **token base units** for your collateral (Hyperlane USDT in this repo is often **18 decimals** per `docs/hyperlane.md`; confirm on-chain for your deployment).

**Bridge guard / policy**

- Vault and OApp may still enforce **LZBridgeGuard** and spending caps on Kite. Large `amount` values can revert even if Scout ranks APY correctly.

## First Successful Cycle Signals

Expected logs in healthy startup/cycle:

- `Redis preflight OK.`
- `Passport CLI preflight OK.`
- `Kite RPC preflight OK.`
- `Using Passport session: ...`
- `Published signal_id=... event_id=... intent=yes|no poai_tx=...`

Quick troubleshooting:

- Passport errors: verify `PASSPORT_CLI_BIN` and active user auth in `kpass`.
- No opportunities in **best_stub_deposit**: lower `DEFILLAMA_MIN_TVL_USD`, check `SCOUT_FEED_TO_STUB_CHAIN_MAP`, or enable **`SCOUT_STUB_APY_FALLBACK`** and set `SCOUT_STUB_CHAIN_RPC_MAP` for on-chain stub APY fallback.
- No execution intent: fill `SCOUT_PROTOCOL_ADDRESS_MAP` (or `ORCA_STUB_PROTOCOL_MANIFEST_PATH`) and `HYP_TRUSTED_REMOTES` (RemoteAdapter bytes32 per destination domain).
- Redis stream issues: check `SCOUT_REDIS_STREAM_KEY` and Redis connectivity.

## Scout Data Provider Strategy

Scout now defaults to a hybrid provider architecture:

- Primary market feed: DefiLlama pools API (APY + TVL + chain/protocol coverage)
- Utilization enrichment (best-effort): Aave / Compound / Morpho / Uniswap adapters
- Legacy mode retained: Lucid-only market feed by setting `SCOUT_MARKET_DATA_PROVIDER=lucid`

In hybrid mode, enricher failures are non-fatal and Scout continues with base market data.
