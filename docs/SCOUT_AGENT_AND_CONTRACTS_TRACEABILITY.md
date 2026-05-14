# Scout Agent and Contracts Traceability

This document maps external documentation requirements to ORCA implementation files for the Scout Agent track and contract rework.

## External Sources Referenced

- Kite Lucid integration: <https://docs.gokite.ai/kite-chain/12-lucid-kite-integration>
- Kite Goldsky integration: <https://docs.gokite.ai/kite-chain/11-goldsky-kite-integration>
- Kite Passport introduction: <https://docs.gokite.ai/kite-agent-passport/kite-agent-passport>
- Kite Passport CLI reference: <https://docs.gokite.ai/kite-agent-passport/cli-reference>
- Kite Passport service provider guide (x402): <https://docs.gokite.ai/kite-agent-passport/service-provider-guide>
- Kite AA SDK: <https://docs.gokite.ai/kite-chain/account-abstraction-sdk>
- Kite gasless transfer design: <https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer>
- Kite gasless integration API: <https://docs.gokite.ai/kite-chain/9-gasless-integration>
- Hyperlane protocol docs: <https://docs.hyperlane.xyz/docs/protocol/protocol-overview>
- Hyperlane Warp Routes: <https://docs.hyperlane.xyz/docs/protocol/warp-routes/warp-routes-overview>

## Requirements to Implementation Mapping

| Requirement | Source Constraint | ORCA Implementation |
| --- | --- | --- |
| SC-01 YieldScanner consumes Lucid + Goldsky signals | Lucid and Goldsky pages define data access and indexing usage on Kite | `agents/src/orca_scout/services/yield_scanner.py`, `agents/src/orca_scout/integrations/lucid_client.py`, `agents/src/orca_scout/integrations/goldsky_client.py` |
| SC-02 Bridge cost estimator uses bridge-quote concepts | Hyperlane migration replaces endpoint-specific checks with domain-aware quote routing | `agents/src/orca_scout/integrations/bridge_fee_client.py` |
| SC-03 Opportunity ranking uses net APY minus bridge cost | ORCA docs define net delta formula | `agents/src/orca_scout/services/opportunity_ranker.py` |
| SC-04 Signal broadcast sends x402 payment and Redis stream event | Passport service provider guide details x402 402 challenge and settlement model | `agents/src/orca_scout/integrations/x402_client.py`, `agents/src/orca_scout/services/signal_broadcaster.py` |
| SC-05 Scout signs outbound signal payload | Passport docs and CLI describe session controls and agent-driven automation | `agents/src/orca_scout/integrations/passport_cli.py`, `agents/src/orca_scout/services/passport_signer.py` |
| SC-06 Scout reports accepted actions to PoAI | ORCA contract requirements include `recordAction` attribution writes | `agents/src/orca_scout/integrations/poai_client.py` |
| Agent runtime loop every 60 seconds with resilient operation | ORCA runtime spec requires continuous scanning | `agents/src/orca_scout/scout_runtime.py`, `agents/src/orca_scout/main.py` |
| On-chain spending controls enforced at contract layer | AA SDK and ORCA requirements call for budget and provider controls | `contracts/contracts/SpendingRuleEnforcer.sol` |
| Registry of DIDs and epoch lifecycle is on-chain | ORCA contract requirements for registry and epoch control | `contracts/contracts/ORCARegistry.sol` |
| Attribution records and epoch reward hooks on-chain | ORCA + tokenomics requirements for PoAI attribution | `contracts/contracts/PoAIAttribution.sol` |
| Hyperlane mailbox security: trusted sender maps, payload versioning, guarded receive path | Hyperlane mailbox/recipient model with origin-domain trust checks | `contracts/contracts/ORCAOApp.sol`, `contracts/contracts/RemoteAdapter.sol`, `contracts/contracts/LZBridgeGuard.sol` |
| x402 channel lifecycle primitive for agent payment rails | ORCA architecture includes channel manager | `contracts/contracts/x402ChannelManager.sol` |
| Deployment artifacts must be reusable and structured | ORCA deployment sequence and operational needs | `contracts/scripts/deploy.ts`, `contracts/deployments/kite-testnet.latest.json`, `contracts/deployments/history/*.json` |

## Runtime and Secret Requirements

The implementation includes `.env.example` templates for:

- Live Lucid and Goldsky endpoints/credentials.
- Passport automation and signing/session controls.
- x402 service endpoint and facilitator details.
- Kite RPC/chain/deployer settings for testnet deployment.
- Contract addresses needed by Scout runtime once deployment completes.

## Scout Live Run Readiness

To run Scout without friction, the following must be true:

- Run from `agents/` directory so `.env` and relative artifact paths resolve.
- `kpass` binary is available and authenticated for non-interactive session commands.
- Redis is reachable and writable at configured `REDIS_URL`.
- Kite RPC is reachable and the Scout signer has native gas for PoAI writes.
- Lucid, Goldsky, bridge quote, and x402 credentials are valid.
- Route constraints are explicitly configured (`SCOUT_ALLOWED_ROUTE_PAIRS`) or loaded from artifact.
- If execution intents are enabled, protocol address map and trusted remotes are fully configured.

Scout now performs startup preflight checks for Redis, Passport CLI, and Kite RPC before entering the scan loop.
