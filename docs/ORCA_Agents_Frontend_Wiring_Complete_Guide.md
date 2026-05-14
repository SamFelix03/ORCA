# ORCA Agents + Frontend Wiring (Complete Guide)

Last updated: 2026-05-14

Scope:
- Covers how agents fit into ORCA end-to-end
- Covers current frontend/backend/contracts state in this repo
- Maps all major requirements from:
  - `docs/ORCA_Requirements_Document.txt`
  - `docs/idea.md`

---

## 1) How Agents Fit In (Direct Answer)

ORCA is not "frontend + backend + optional agents". The agents are the core decision/execution engine, and the frontend is the owner control plane.

The four agents form a deterministic pipeline:

1. Scout Agent (discovery)
- Watches cross-chain yield opportunities.
- Emits signed `YieldSignal` events.
- Pays the next stage via x402 micropayment.

2. Risk Agent (safety gate)
- Verifies Scout signal signature and eligibility.
- Pulls collateral and oracle context.
- Simulates rebalance effect and enforces risk constraints.
- Approves/rejects with signed `ExecutionInstruction`.
- Pays Executor via x402.

3. Executor Agent (transaction authority)
- Only agent allowed to execute rebalance actions.
- Converts approved instruction into AA `UserOperation` batch.
- Executes local-chain or cross-chain (Hyperlane mailbox path).
- Reports execution outcome and slippage.

4. Audit Agent (immutable attribution)
- Subscribes to all agent events.
- Writes PoAI attribution records on-chain.
- Produces epoch reward distribution proposal flow.

What frontend does in this model:
- Shows live state of agent pipeline (signals, decisions, tx outcomes, alerts).
- Lets owner approve/reject spending sessions and policy changes.
- Exposes treasury and PoAI views.
- Acts as governance/observability/control surface, not as core execution engine.

---

## 2) ORCA System Design from Requirements + Idea

From `idea.md` and requirements, ORCA is defined by these mandatory primitives:

- Identity/authorization: Kite Passport DID + passkey-scoped sessions.
- Execution wallet model: ERC-4337 AA vaults (`ClientAgentVault` pattern).
- Agent-to-agent economics: x402 micropayments.
- Treasury governance: Ash/Safe-style multisig with threshold guardrails.
- Cross-chain execution: Hyperlane mailbox + trusted remote path.
- Attribution economy: PoAI per-action recording and epoch reward distribution.
- Data substrate: Goldsky indexing and webhook/event ingestion; Lucid integration context.

In short:
- Agents are the autonomous operators.
- Contracts are the immutable constraint and settlement layer.
- API is orchestration + persistence + stream gateway.
- Frontend is control, auditability, and governance UX.

---

## 3) Current Repository State (What Exists Now)

### 3.1 Frontend
Implemented routes:
- `/`
- `/positions`
- `/agents`
- `/signals`
- `/sessions`
- `/treasury`
- `/poai`
- `/settings`

Implemented frontend pillars:
- Full tokenized design system using the provided palette.
- Local `Geist Mono` integration.
- Shared UI primitives (`button`, `card`, `badge`, `status-pill`, `data-table`).
- Sidebar + top-header app shell.
- API client and websocket client wiring.
- Session approve/expire UI actions.

### 3.2 API
Implemented:
- Fastify service scaffolding (BE modules shape).
- REST routes for auth/sessions/positions/agents/signals/treasury/poai/alerts.
- Chain status route.
- WebSocket gateway with typed event envelopes.
- Repository layer with Prisma-first reads and fallback mock data.
- HMAC webhook verification flow.

### 3.3 Contracts
Implemented scaffolds:
- `ORCARegistry`
- `SpendingRuleEnforcer`
- `PoAIAttribution`
- `ORCAOApp` (entry stub for cross-chain request path)

These compile and provide the right contract boundaries, but they are still early scaffolds relative to full production behavior.

### 3.4 DB Layer
Implemented:
- Prisma schema covering agents, signals, executions, positions, sessions, attribution, epochs, alerts.
- Seed script present but not yet run by user request.

Current runtime behavior before DB seed:
- API can serve data via fallback mock records.
- Frontend remains fully functional while DB is empty.

---

## 4) Agent Runtime-to-System Wiring (Target Design)

## 4.1 Event Bus Contract (Core Integration)

Primary bus: Redis Streams (as required doc suggests).

Stream families:
- `orca:signals:scout` (default Scout stream key in current runtime)
- `orca.risk.decisions`
- `orca.executor.executions`
- `orca.audit.records`
- `orca.alerts`
- `orca.sessions`

Each event envelope should include:
- `event_id`
- `event_type`
- `version`
- `created_at`
- `source_agent_did`
- `trace_id` (pipeline correlation)
- `signature` (where required)
- typed payload body

This gives replay safety, observability, and deterministic fan-out to API + Audit.

## 4.2 Per-Agent IO Contracts

### Scout Agent
Inputs:
- Market/yield inputs (Lucid/Goldsky derived datasets)
- Config thresholds from policy layer

Outputs:
- `YieldSignal` to Redis stream
- x402 payment receipt to Risk
- optional early PoAI signal-entry event

API/DB touchpoints:
- Persist signal rows (`signals` table)
- Update `/signals` feed
- Emit `signal.created` websocket event

### Risk Agent
Inputs:
- `YieldSignal` events
- Oracle/collateral state
- spending rule read-model

Outputs:
- Approved/Rejected decision record
- Signed `ExecutionInstruction` for Executor
- x402 payment receipt to Executor
- Risk rationale and overrides

API/DB touchpoints:
- update signal status and reason fields
- trigger alert when liquidation defense path fires
- emit `signal.updated` and alert websocket events

### Executor Agent
Inputs:
- Signed `ExecutionInstruction`
- Active session authority
- spending-window validity

Outputs:
- Local/cross-chain execution receipts
- slippage outcomes
- failure reasons and retry paths

API/DB touchpoints:
- write `executions` row
- set signal execution status
- emit `execution.settled` event
- update treasury/position read models

### Audit Agent
Inputs:
- All major signal/decision/execution/session events

Outputs:
- PoAI attribution writes (on-chain)
- epoch reward proposal lifecycle events
- compliance trace to DB

API/DB touchpoints:
- write `attribution_records`
- aggregate `epochs`
- serve `/poai/*` responses
- emit info/warning alerts for attribution anomalies

---

## 5) Frontend Wiring to Agent Lifecycle

### Dashboard `/`
Shows the cross-agent health summary:
- active agents
- pending signals
- treasury status
- critical alerts
- live websocket event stream

### Positions `/positions`
Shows risk-relevant state:
- chain/protocol allocation
- APY
- health factor
- updates after executor settlement

### Agents `/agents`
Per-agent observability:
- DID
- vault
- spending usage
- online/offline
- latest action

### Signals `/signals`
Scout/Risk/Executor pipeline view:
- source/destination route
- net delta
- decision status
- execution tx hash

### Sessions `/sessions`
Owner authority controls:
- approve/revoke/passive expiry visibility
- maps to Passport session governance

### Treasury `/treasury`
Governance and safety view:
- balance
- threshold
- pending multisig proposals
- chain status context

### PoAI `/poai`
Attribution and incentive layer:
- epoch rewards
- per-agent reward visibility

### Settings `/settings`
Policy staging surface:
- collateral floor
- max rebalance
- budget caps
- (final form should map to controlled on-chain/off-chain policy pipeline)

---

## 6) Full Requirements Coverage Matrix

Status codes:
- Done (implemented now)
- Scaffolded (structure exists; core logic pending)
- Planned (not yet implemented)

### 6.1 Kite Modules (KM-01..KM-08)

- KM-01 Passport: Scaffolded
  - session UI/API boundaries are present
  - full kpass login/session lifecycle integration pending

- KM-02 AA SDK: Scaffolded
  - contract boundaries and executor flow shape present
  - real AA operation pipeline pending

- KM-03 x402 micropayments: Planned
  - event model reserved
  - transport/settlement wiring pending

- KM-04 Ash multisig: Scaffolded
  - treasury UI/API placeholders present
  - live multisig reads/actions pending

- KM-05 Hyperlane Mailbox + Warp Route: Scaffolded
  - OApp contract entry exists
  - trusted peer + receive execution path pending

- KM-06 PoAI: Scaffolded
  - contract + API routes present
  - full attribution engine and epoch scheduling pending

- KM-07 Goldsky: Planned
  - webhook endpoint exists
  - production indexer deployment + signing/replay contract pending

- KM-08 Lucid: Planned
  - data contract assumed by Scout design
  - live query integrations pending

### 6.2 Agent Modules

- SC-* (Scout): Implemented (live integration runtime in `agents/src/orca_scout`)
- RK-* (Risk): Planned
- EX-* (Executor): Planned
- AU-* (Audit): Planned

Scout runtime is implemented. Risk/Executor/Audit remain planned.

### 6.3 Backend Modules (BE-01..BE-09)

- BE-01 Auth: Scaffolded
- BE-02 Sessions: Done (baseline APIs + frontend actions)
- BE-03 Positions: Done (baseline)
- BE-04 Agents: Done (baseline)
- BE-05 Signals: Done (baseline)
- BE-06 Treasury: Done (baseline)
- BE-07 PoAI: Scaffolded
- BE-08 Alerts: Done (baseline + signed webhook verify)
- BE-09 WebSocket: Done (typed gateway + event broadcasts)

### 6.4 Frontend Modules (FE-01..FE-11)

- FE-01 WalletConnector: Planned
- FE-02 PasskeyApproval: Planned
- FE-03 RealTimeEngine: Done (baseline ws client)
- FE-04 PositionTable: Done (baseline)
- FE-05 AgentStatusCard: Done (baseline)
- FE-06 SignalFeed: Done (baseline)
- FE-07 YieldChart: Planned
- FE-08 MultisigPanel: Scaffolded
- FE-09 PoAILeaderboard: Scaffolded
- FE-10 AlertBanner: Scaffolded (alert cards now)
- FE-11 SettingsForm: Scaffolded

---

## 7) End-to-End Runtime Flows (Target)

## 7.1 Normal Yield Rebalance
1. Scout emits signal.
2. Risk validates + simulates.
3. Risk approves and emits instruction.
4. Executor executes (AA local/cross-chain).
5. Audit records attribution.
6. API persists state transitions.
7. Frontend updates in real-time via WS.

## 7.2 Emergency Liquidation Defense
1. Risk detects critical HF breach.
2. Risk overrides standard yield move with defense action.
3. Executor prioritizes emergency transaction.
4. Alert raised immediately.
5. Audit marks protected-loss-avoidance attribution.

## 7.3 Session Exhaustion / Renewal
1. Executor cannot proceed due to budget/session expiry.
2. Session request event emitted.
3. Frontend `/sessions` prompts owner action.
4. Approval unblocks executor path.

## 7.4 Epoch Reward Lifecycle
1. Audit aggregates attribution records.
2. Epoch boundary reached.
3. Distribution proposal created (multisig/governance path).
4. `/poai` and `/treasury` reflect pending + settled results.

---

## 8) Contract-to-API-to-Frontend Mapping

### ORCARegistry
- API: agent registry/epoch reads
- Frontend: `/agents`, chain/epoch context in `/treasury`

### SpendingRuleEnforcer
- API: spending window snapshots, rule breach alerts
- Frontend: session + risk policy telemetry

### PoAIAttribution
- API: epoch/agent reward history
- Frontend: `/poai`

### ORCAOApp
- API: execution status and cross-chain lifecycle traces
- Frontend: `/signals` and `/treasury` operational confidence

---

## 9) Data Model Coverage vs Requirements

Implemented table families align with requirements:
- agents
- signals
- executions
- positions
- sessions (maps to passport session lifecycle surface)
- attribution_records
- epochs
- alerts

Still to add from requirements phrasing:
- explicit `spending_windows` table (can be derived or materialized later)
- stronger historical tables for position snapshots and signal revisions

---

## 10) Security and Governance Expectations

Must-have controls from requirements/idea:
- agent-scoped authority only (no broad execute keys)
- session TTL and budget bounds
- provider allowlists and spending windows
- multisig threshold for high-value operations
- LayerZero trusted peer hardening
- signed webhook + replay resistance
- immutable attribution/event trail for disputes

Current status:
- webhook signature verification done (basic)
- contract + API guardrail surfaces scaffolded
- advanced security hardening still pending

---

## 11) What Happens When We Seed DB Next

When seeding is executed:
- Prisma tables receive initial coherent ORCA records.
- UI stops relying on fallback-only mock path for empty DB.
- API endpoints return stable seeded domain records.
- We can begin replacing each fallback path with strict DB-only behavior and then agent-produced updates.

---

## 12) Immediate Next Milestones (After User Says Seed)

1. Run DB push + seed.
2. Switch API to DB-preferred with explicit fallback feature flag.
3. Add Redis stream producer/consumer contracts for agent event ingress.
4. Implement live signal and execution upsert pathways.
5. Integrate Passport session state with BE-02.
6. Add execution audit trails visible in `/signals` and `/poai`.
7. Start incremental agent runtime integration (Scout first), if requested.

---

## 13) Final Summary

How agents fit:
- They are the operational intelligence and execution chain.
- Frontend is owner control, trust, and governance UX.
- Contracts enforce immutable safety and attribution boundaries.
- API and indexer bridge asynchronous agent activity into deterministic, queryable, real-time product behavior.

Without agents, ORCA is a structured shell.
With agents wired in, ORCA becomes the full autonomous risk-coordination protocol described in the requirements and idea docs.
