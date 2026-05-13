# ORCA Non-Agent Execution Plan (Contracts + API + Frontend)

Scope: Everything except agent runtime internals.

## 1) Contract Layer Plan

## 1.1 Contracts to implement now
- `ORCARegistry`
  - DID -> vault mapping
  - agent type registry
  - epoch lifecycle events
- `SpendingRuleEnforcer`
  - time-window budget enforcement
  - provider whitelist checks
  - consecutive breach -> pause circuit
- `PoAIAttribution`
  - attribution record writes
  - epoch-level accounting hooks
  - reward distribution trigger event
- `ORCAOApp`
  - executor-only cross-chain rebalance entrypoint
  - trusted peer registry by destination eid
  - endpoint support checks and emission hooks

## 1.2 Contract integration contracts
- API read adapters:
  - registry reads (agent metadata)
  - enforcer reads (budget window, whitelist)
  - poai reads (epoch reward traces)
- Indexer event map:
  - `AgentRegistered`
  - `SpendingRuleBreach`
  - `ActionRecorded`
  - `CrossChainRebalanceRequested`

## 1.3 Security hardening backlog
- production access-control matrix
- full pause/unpause and emergency controls
- replay protections on externally submitted proofs
- lz receive-path validation and stateful reconciliation
- formalized limits and overflow-invariant tests

## 2) API Layer Plan

Target modules (aligned to BE-01..BE-09):
- BE-01 Auth: SIWE nonce/verify and JWT issuance
- BE-02 Sessions: pending approvals, approve/reject/expire
- BE-03 Positions: current + history aggregator
- BE-04 Agents: DID, vault, policy usage, latest actions
- BE-05 Signals: signal ledger + execution status projection
- BE-06 Treasury: balance + multisig pending proposals
- BE-07 PoAI: epoch rewards + per-agent reward history
- BE-08 Alerts: webhook ingest + alert feed
- BE-09 WebSocket: typed event fan-out

## 2.1 API -> Contracts mapping
- `/agents` <- ORCARegistry + vault metadata
- `/treasury/*` <- multisig adapters
- `/poai/*` <- PoAIAttribution reads
- `/alerts/webhook` <- indexer + monitoring integrations

## 2.2 API -> Frontend contract
- REST (query/state surfaces)
- WebSocket (live updates)
  - `signal.created`
  - `signal.updated`
  - `execution.settled`
  - `alert.created`
  - `session.requested`
  - `session.updated`

## 3) Frontend Layer Plan

Routes from requirements:
- `/` dashboard
- `/positions`
- `/agents`
- `/signals`
- `/sessions`
- `/treasury`
- `/poai`
- `/settings`

## 3.1 Connection model
- typed API client using shared contracts
- websocket live stream hook for event updates
- route-level slices bound to matching BE module

## 3.2 UX build order
1. Dashboard shell + nav
2. Positions/Agents/Signals/Sessions/Treasury/PoAI data pages
3. Session approval interactions
4. Settings form + proposal pipeline
5. error/loading/retry and auth guard

## 4) Indexer and Infra plan (non-agent)

- Indexer package:
  - Goldsky manifests and ABI wiring
  - webhook signing and replay-safe delivery
- Infra package:
  - docker compose for frontend/api/postgres/redis
  - env templates for local/testnet/mainnet
  - chain constants and deploy docs

## 5) Milestones

M1: Shared contract/types foundation (done)
M2: Contracts scaffold + deploy scripts (done)
M3: API module skeleton + ws contract (done)
M4: Frontend routes wired to API + live ws (done)
M5: Next phase
- DB persistence (Prisma)
- real chain adapters (ethers)
- Goldsky ingestion
- auth/session hardening
- contract test suites

## 6) Explicit Exclusions

- agent runtime orchestration, reasoning, and execution internals (Scout/Risk/Executor/Audit processes)
- inter-agent bus logic beyond typed interfaces and API compatibility surfaces
