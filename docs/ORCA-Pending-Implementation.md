# ORCA — Pending implementation checklist

Use this list as a working backlog. Each item is graded against **what is actually in the repo today** (see **Status legend**).

**Hackathon submission scope (authoritative for this build):** The **only** on-chain “yield protocol” surface in scope is **ORCA stub vaults** that simulate supply / accrual / withdraw. **Principal insertion into Aave, Compound, Morpho, or Uniswap production contracts is explicitly out of scope** for the submission; instead, deploy **four protocol-labeled stub contracts per target** (naming/ABI flavor only) that agents and Hyperlane-driven flows treat as the deposit destination. The fuller `orcaDocs.md` vision (real lending integrations, full PoAI economics, Ash multisig production path, etc.) remains backlog below—**nice-to-have or post-hack**, not required for the hack deliverable.

**Stub token model:** Stubs MUST be designed to work with **any USDT token** the operator wires per chain: bind a single `IERC20` **USDT** address set at deployment (or owner-updatable) **without** a curated protocol-wide whitelist—any standard ERC-20 that you treat as USDT on that network (testnet or otherwise) can be plugged in. Use normal `transferFrom` / `transfer` flows; document known edge cases (fee-on-transfer, rebasing) as non-goals for the hack if they appear.

### Status legend

| Mark | Meaning |
|------|---------|
| **✅ Done** | Implemented and usable in-repo (may still need your env keys / deployed addresses). |
| **🟡 Partial** | Some of the capability exists; gaps listed inline. |
| **❌ Open** | Not implemented (or explicitly deferred). |

*Last honest pass:* codebase scan + contracts/agents/api/frontend as of the hackathon track work. **Hyperlane collateral:** Operator has **USDT warp routes** between Kite and each of the four Sepolia-family chains (use that as the live bridge surface; repo smoke docs may still mention the older PIEUSD snapshot path). **Auth tier:** Server-side JWT correctness / SIWE verification is **not required** for this hack tier; dashboard and `GET /me/*` support **`?wallet=0x…`** so portfolio works from WalletConnect alone. **You still owe:** `pnpm install` (incl. `frontend/.npmrc` hoists), `prisma db push` / migrate when pointing API at a real DB, **`deploy-spoke` on each spoke** (see deployment inventory below) + **reconcile `ORCAOApp.setTrustedRemote`** with each spoke’s **`RemoteAdapter`** (padded `bytes32`), and filling manifests with **real** stub addresses per chain.

---

## Hackathon scope — stub “yield protocols” (4 chains × 4 labels)

### Deploy matrix

**🟡 Partial:** `contracts/scripts/deploy-remote-stubs.ts` (stubs-only) and **`contracts/scripts/deploy-spoke.ts`** ( **`RemoteAdapter` + four stubs** per chain) exist; spoke artifacts go to `deployments/<network>.spoke.json`. `contracts/config/orca-collateral.manifest.json` is a **template** (nulls) for per-chain collateral.

**Committed deployment inventory (repo):**

| Surface | In repo today | Notes |
|--------|----------------|--------|
| Kite (2368) Hub | ✅ `deployments/kite-testnet.latest.json` | Full deploy: `ORCAOApp`, `RemoteAdapter`, `ClientAgentVault`, registry, etc. |
| Sepolia / Arb Sepolia / OP Sepolia / Base Sepolia spokes | ❌ No `*.spoke.json` committed | Run `pnpm hardhat run scripts/deploy-spoke.ts --network <name>` per chain with `ORCA_UNDERLYING_TOKEN` + `ORCA_SPOKE_MAILBOX`. **Not run in CI here** — needs `PRIVATE_KEYS` + RPC URLs in `.env`. |
| `trustedRemotes` inside `kite-testnet.latest.json` | ⚠️ Likely **stale vs design** | Values look like **old warp/router-style peers**, not necessarily the **spoke `RemoteAdapter`** padded to `bytes32`. After spoke deploys, call **`ORCAOApp.setTrustedRemote(domain, remoteAdapterBytes32)`** on Kite and **`RemoteAdapter.setTrustedSender(2368, oappBytes32)`** on each spoke. |

**Missing:** Verified spoke addresses checked in, optional verify runbook, canonical **USDT** Hyperlane export path (`HYPERLANE_INTEGRATION_SNAPSHOT` or operator JSON) if scripts should drop PIEUSD-era defaults.

### USDT binding (any deployment)

**🟡 Partial:** Underlying is **`immutable`** set in the stub constructors (no global protocol whitelist). **Missing:** optional `onlyOwner` `setUnderlying` / “setUSDT” called out in this doc (not in contracts today).

### Core vault behavior (pending contract work)

**✅ Done (stubs):** `OrcaStubYieldVaultBase` + facades: `deposit` / `withdraw`, protocol-shaped `supply` / `mint` / Comet-style `supply`; principal + time-based `apyBps` accrual.

### Owner-funded reward pot (demo “extra yield” on withdraw)

**✅ Done:** `fundRewards` (owner), `rewardReserve`, `RewardsFunded`; withdrawals require yield ≤ `rewardReserve` where applicable.

**🟡 Partial:** No separate `onlyRewarder` role; caps are revert-based (e.g. insufficient float), not a configurable treasury cap.

### Read surface for agents / UI

**🟡 Partial:** `principalOf`, `accruedYield`, `claimableOf` on base. **Missing:** explicit `previewWithdraw` name; live **API** routes that read on-chain stub state for a wallet (not built).

### Withdraw semantics

**✅ Done (base path):** Full exit pays principal + accrued yield from reserve. **🟡 Partial:** Aave-shaped stub `withdraw` enforces full-exit semantics aligned with the stub (not production Aave).

### Adapter / Executor wiring (in scope for hack story)

**🟡 Partial:** `RemoteAdapter.handle` **does** `collateralToken.approve(toProtocol, amount)` + `depositFor(beneficiary, amount)` (not “events only”). **Partial:** end-to-end **demo** still needs bridged collateral on the adapter, relayer, and correct `trustedSenders` / payloads. Executor: optional **`EXECUTOR_SUBMIT_VAULT_TX`** broadcasts `ClientAgentVault.execute` calldata from Scout `execution_intent` on Kite.

### Labeling

**🟡 Partial:** Stub nature is documented in this file, `contracts/scripts/hyperlane/README.md`, agents README. **Missing:** dedicated pitch/README “stubs vs production” one-pager if you want judges-only copy.

---

## Multi-tenant users — deposits, AUM, and dashboard scoping

**Rationale:** Many end users will use the app at once; some will run or **purchase access to multiple Scout agents** (or strategies). The dashboard must show **only their** capital, stub/position balances, yield, and relevant agent activity—not a global pool with no owner.

**🟡 Partial — `User` / `Account`:** Prisma `User` with `walletAddress`; upsert on **`POST /auth/verify`**. **Gaps:** **SIWE/signature is not verified server-side** today (body must include signature but API does not recover/sign-check); Passport subject link not modeled.

**🟡 Partial — Deposit ledger:** Prisma `Deposit` + relation to `User`; seed example in `api/src/db/seed.ts`. **Missing:** authenticated **`POST`** (or ingest) to append deposits; `scoutProductId` / `entitlementId` fields.

**🟡 Partial — Portfolio mapping:** `Position.userId` optional FK to `User` (seed ties demo positions to a demo wallet). **Missing:** automatic rollup rules / `UserVault` abstraction.

**🟡 Partial — API authorization:** **`GET /me/positions`** and **`GET /me/deposits`** accept **`Authorization: Bearer`** *or* **`?wallet=0x…`** (checksummed); no JWT is **mandatory** for this demo tier. **Missing:** same scoping on **`GET /positions`**, signals, sessions, alerts (still global where they were).

**❌ Open — Indexer / webhook / subgraph** for stub events → `userId`.

**❌ Open — Scout marketplace** `userId` ↔ scout purchase graph.

**🟡 Partial — Frontend:** Dashboard **WalletPortfolioCard** (wagmi connect; optional SIWE-style sign for JWT; **portfolio loads with wallet query** without JWT). **Missing:** robust WalletConnect without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; chain switch for all four chains; `accountsChanged` hardening; read on-chain stub balances in UI.

**🟡 Hack minimum:** seeded demo user + deposits + positions in `db:seed` **if** DB migrated.

---

## Agent runtime / pipeline

### Risk Agent — full safety gate (`RK-02`–`RK-05`, `RK-07`)

**🟡 Partial (hack minimum):** Simple approve/reject path remains; **❌ Open** for full APRO / enforcer simulation per `orcaDocs.md`.

### Executor Agent — execution path

**🟡 Partial:** Optional on-chain **`EXECUTOR_SUBMIT_VAULT_TX`** submits Scout **`vault_execute_calldata`** (vault → OApp). **Still:** PoAI + x402 settlement path; **❌ Open** for direct “read claimable on stub” loop and destination-chain executor batches.

### Audit Agent — full attribution lifecycle (`AU-04`, `AU-05`)

**❌ Open** (full spec). **🟡 Hack minimum:** downstream can consume existing Redis/stream events.

### Scout Agent

**🟡 Partial:** `ORCA_STUB_PROTOCOL_MANIFEST_PATH` **or** `SCOUT_PROTOCOL_ADDRESS_MAP`; `HYP_TRUSTED_REMOTES` must be **RemoteAdapter bytes32** (warp router auto-load removed from execution builder). **❌ Open:** ranking purely driven by stub manifest APY (still relies on market feed for opportunities).

### Inter-agent payments — x402 “channels”

**🟡 Partial (hack minimum):** x402 client plumbing remains. **❌ Open** full channel lifecycle.

---

## Cross-chain / DeFi execution

### Hyperlane + USDT + stub vaults (**hack in scope**)

**🟡 Partial:** **PIEUSD**-era smoke **scripts** (`contracts/scripts/hyperlane/*`) and artifacts in-repo prove a reference hub↔spoke pattern; **operator USDT warps** are now the live collateral path between Kite and the four chains. Operator scripts bridge to a recipient (e.g. `RemoteAdapter`). **`RemoteAdapter.handle`** performs **approve + `depositFor`**. **Missing:** full scripted “bridge → handle → withdraw with float” CI story on all four chains; point smoke/env at operator’s **USDT** integration export (`HYPERLANE_INTEGRATION_SNAPSHOT` / snapshot JSON) where defaults still assume PIEUSD.

### Real production protocols (**out of scope for hack**)

**❌ Deferred** (explicit).

### `ORCAOApp` / trusted remotes

**🟡 Partial:** Deploy + `.env.example` document **peers = destination `RemoteAdapter`**, not warp `destinationRouter`. **❌ Open** production hardening / monitoring.

### Remote chain adapters

**✅ Done (stub path in contract):** `handle` decodes OApp payload and calls stub **`depositFor`**. **❌ Deferred:** rich multi-protocol rebalance on destination.

---

## On-chain / Kite integrations

### Account abstraction (`KM-02`)

**🟡 Hack path:** EOA / `ClientAgentVault` calldata path documented. **❌ Post-hack:** full AA batching.

### PoAI / registry (`KM-06`)

**🟡 Partial** PoAI touchpoints; **❌ Open** full marketplace/epoch spec.

### Ash / multisig treasury (`KM-04`)

**❌ Post-hack** live Ash (not required for stub story).

### x402 channel manager contract (`x402ChannelManager`)

**❌ Post-hack** full wiring.

---

## Permissionless Scout “marketplace”

### On-chain registration + Product surface

**🟡 Partial** in repo (scout registration routes exist). **❌ Open** full marketplace UX scope.

---

## Data / indexing (`KM-07`, `KM-08`)

### Goldsky / webhooks

**❌ Open** for stub event indexing → dashboard earnings (see Multi-tenant).

### Scout data layer

**🟡 Partial:** env + manifest patterns for stub addresses; **❌ Open** enrichers fully aligned to **your** four-chain USDT manifest only.

---

## Backend API (`BE-*` gaps)

**🟡 Partial:** **`/me/positions`** & **`/me/deposits`** — JWT **or** **`?wallet=`** (see portfolio routes). **❌ Open:** on-chain **stub read** proxies (claimable/principal) in API; dedicated deposit CRUD; full per-user AUM aggregation.

---

## Frontend (`FE-*` gaps)

### WalletConnect + wallet-driven UX (`FE-01` extension)

**🟡 Partial:** wagmi + connectors (WalletConnect if project id set); optional sign-in calls `/auth/nonce` + `/auth/verify`. **❌ Open (post-hack if desired):** signature verification on server; primary identity end-to-end on **all** surfaces; multi-chain switch UX; disconnect/account-change polish.

### Dashboard and other surfaces

**🟡 Partial:** “My portfolio” card on dashboard. **❌ Open:** every surface scoped to wallet; live stub yield wired from chain or API.

---

## Infrastructure / testing / launch

### Docker / prod

**❌ Open** beyond demo assumptions.

### Automated tests

**🟡 Partial:** Hardhat tests for **stub vaults** + core ORCA tests. **❌ Open:** full “seed float → deposit → accrue → withdraw” **integration** on forked testnet in CI; four-chain expansion.

### Security / audit

**🟡 Hack-appropriate:** `ReentrancyGuard`, `onlyOwner` on sensitive ops, immutable underlying by design. **❌ Post-hack:** professional audit.

---

## Economics / doc clarity

### Scout earnings path

**🟡 Hack:** x402 + narrative. **❌ Open** full PoAI payouts per `orcaDocs.md`.

---

## Explicitly deferred (post-hack vs `orcaDocs.md`)

Treat as **not part of the submission**: real Aave v3 / Compound III / Morpho Blue / Uniswap v3 **production** integration; full x402 state channels; Ash Timelock production; Goldsky coverage for every spec event; mainnet deployment playbook.

---

## Recheck — done vs not done (this track)

| Area | Status |
|------|--------|
| Stub vaults (4 labels) + tests + `deploy-remote-stubs` / **`deploy-spoke`** | ✅ In repo |
| Kite hub contracts (`kite-testnet.latest.json`) | ✅ **Committed** on-chain snapshot in repo |
| Spoke **`RemoteAdapter` + stubs** on Sepolia, Arb/OP/Base Sepolia | ❌ **No `*.spoke.json` in repo** — deploy per chain locally, then commit or publish addresses |
| Hyperlane **USDT** routes (operator) | ✅ **Assumed live** (not in repo); wire smoke / `HYPERLANE_INTEGRATION_SNAPSHOT` to operator export |
| `ORCAOApp` ↔ spoke **`trustedRemote`** | ⚠️ **Reconcile** after spoke deploys (current JSON may still list router-style peers) |
| API portfolio **`?wallet=`** without JWT | ✅ **Intentional** for hack tier |
| JWT / SIWE verification | 🟡 **Not required** for this tier; server verify still open if you harden later |
| Agents manifest + `HYP_TRUSTED_REMOTES` = spoke `RemoteAdapter` | 🟡 **Fill with real addresses** after spokes exist |

*Update this file as items ship. Hack scope: stub USDT vaults as the protocol layer; real defi integration is backlog.*
