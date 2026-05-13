# ORCA x Kite Integration Blueprint (Validated from Kite MCP Docs)

## 1) Objective
ORCA is an agentic DeFi risk-coordination protocol where four specialized agents (Scout, Risk, Executor, Audit) manage cross-chain positions with cryptographic controls and verifiable attribution.

This blueprint translates the requirements into an implementable monorepo design validated against current Kite documentation fetched through the Kite MCP.

## 2) What Was Verified from Kite Docs
The following was opened and analyzed from Kite MCP:

- https://docs.gokite.ai/
- https://docs.gokite.ai/get-started-why-kite/introduction-and-mission
- https://docs.gokite.ai/get-started-why-kite/architecture-and-design-pillars
- https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology
- https://docs.gokite.ai/get-started-why-kite/key-use-cases-and-players
- https://docs.gokite.ai/get-started-why-kite/tokenomics
- https://docs.gokite.ai/kite-agent-passport/kite-agent-passport
- https://docs.gokite.ai/kite-agent-passport/beginner-setup
- https://docs.gokite.ai/kite-agent-passport/cli-reference
- https://docs.gokite.ai/kite-agent-passport/service-provider-guide
- https://docs.gokite.ai/kite-agent-passport/funding
- https://docs.gokite.ai/kite-chain/1-getting-started/network-information
- https://docs.gokite.ai/kite-chain/1-getting-started/tools
- https://docs.gokite.ai/kite-chain/3-developing
- https://docs.gokite.ai/kite-chain/3-developing/smart-contracts-list
- https://docs.gokite.ai/kite-chain/4-building-dapps
- https://docs.gokite.ai/kite-chain/account-abstraction-sdk
- https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer
- https://docs.gokite.ai/kite-chain/9-gasless-integration
- https://docs.gokite.ai/kite-chain/multisig-wallet
- https://docs.gokite.ai/kite-chain/10-layerzero-kite-integration
- https://docs.gokite.ai/kite-chain/11-goldsky-kite-integration
- https://docs.gokite.ai/kite-chain/12-lucid-kite-integration
- https://docs.gokite.ai/kite-chain/6-reference
- https://docs.gokite.ai/kite-chain/7-kite-node
- https://docs.gokite.ai/kite-chain/mica-whitepaper

### Stale links in requirements doc
These links in the requirements file currently return not found:
- `/kite-agent-passport/developer-guide`
- `/kite-agent-passport/end-user-guide`
- `/kite-agent-passport/testnet-notice`

Current equivalent doc paths are primarily centered on:
- `/kite-agent-passport/kite-agent-passport`
- `/kite-agent-passport/beginner-setup`
- `/kite-agent-passport/cli-reference`
- `/kite-agent-passport/service-provider-guide`
- `/kite-agent-passport/funding`

## 3) Architecture Decisions Driven by Verified Docs

### Identity and authorization model
- Use Kite Passport as user-controlled delegated identity.
- Use session-based approvals with passkeys for spend windows.
- Run all CLI automation in JSON/non-interactive mode (`kpass ... --output json --no-interactive`) for deterministic agent runtime integration.

### Account abstraction and vault control
- Use `gokite-aa-sdk` to manage agent smart accounts and batched `UserOperation`s.
- Enforce budget/time/provider constraints in on-chain spending rules.
- Treat the Executor as the only agent with active transaction execution authority.

### Payment rail strategy
- Use x402-style machine payments where applicable for service-to-service pay-per-call.
- Use Kite gasless/EIP-3009 flows for user-friendly transfers where sponsored execution is needed.

### Cross-chain model
- Use LayerZero v2 with Kite mainnet endpoint metadata:
  - chain id `2366`
  - endpoint id `30406`
  - EndpointV2 `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B`
- Enforce trusted peer configuration per destination chain before enabling production routing.

### Treasury and governance
- Use Ash wallet (Safe-style) for 3-of-5 treasury operations.
- Use timelocked/high-threshold controls for critical transfer and bridge actions.

### Data and observability
- Use Goldsky as the primary indexing/event ingestion layer (subgraph + webhook patterns).
- Use Lucid integration for cross-chain yield-bearing stablecoin and controller awareness.
- Keep all agent events mirrored to Postgres + Redis streams for replay, audit, and dashboard real-time updates.

## 4) End-to-End Runtime Topology

- Frontend (owner control plane): session approvals, risk settings, live portfolio and signal feed.
- API (orchestration plane): auth, persistence, webhook intake, websocket fan-out.
- Agents (decision plane): Scout, Risk, Executor, Audit as independently deployable services.
- Contracts (control plane): registry, vault policies, attribution hooks, bridge guard interfaces.
- Indexer (data plane): Goldsky subgraph manifests and webhook adapters.
- Infra (ops plane): compose files, env templates, deploy scripts, runbooks.

## 5) Monorepo Boundary Contract

- `frontend`: Next.js UI app, wallet UX, passkey approval UX, WS consumers.
- `api`: Fastify service, SIWE/JWT, REST modules, webhook ingest, WS gateway.
- `agents`: Python runtime for scout/risk/executor/audit and shared decision libraries.
- `contracts`: Solidity + deployment tooling for ORCA-specific control contracts.
- `indexer`: Goldsky config/subgraph manifests/webhook adapters.
- `infra`: Docker Compose/K8s/Terraform/scripts/env templates.
- `packages`: shared TS libraries (types, ABI bindings, SDK wrappers) when implementation starts.
- `tests`: cross-package integration/e2e harnesses.

## 6) Critical Implementation Contracts Between Packages

### `api` <-> `agents`
- Redis Streams channel contracts for signals, approvals, executions, alerts.
- Strict JSON schema versioning for all event messages.

### `agents` <-> `contracts`
- ABI-driven interactions only.
- Shared typed payload codecs in `packages/*` once created.

### `indexer` <-> `api`
- Signed webhook ingestion endpoint and replay protection.
- Idempotent event upserts for chain reorg tolerance.

### `frontend` <-> `api`
- WS event contract for: `signal.created`, `risk.decision`, `execution.settled`, `alert.critical`, `session.requested`, `session.expired`.

## 7) Security Baseline for ORCA Buildout

- Session TTL + budget + provider allowlists enforced by policy and on-chain rule layers.
- All agent-issued instructions signed and verifiable (DID/session context).
- Executor guarded by slippage bounds + circuit-breaker pause paths.
- High-value treasury/bridge actions gated by multisig and delay windows.
- End-to-end immutable action lineage persisted for PoAI attribution and incident forensics.

## 8) Build Readiness Checklist (Before Coding Features)

- Finalize per-service language runtime and package manager conventions.
- Finalize event schema and chain ID/endpoint constants shared package.
- Finalize environment matrix (local/testnet/mainnet) and secret boundaries.
- Finalize Goldsky project setup and webhook auth contract.
- Finalize LayerZero trusted peer and failure handling plan.

---

This document is the implementation blueprint corresponding to the current Kite docs state and the ORCA requirements document.
