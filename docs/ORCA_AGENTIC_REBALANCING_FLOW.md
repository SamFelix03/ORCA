# ORCA Agentic Rebalancing Flow

This document is a source-level walkthrough of the ORCA workflow across `agents/`, `api/`, `indexer/`, `contracts/`, `contracts/scripts/hyperlane/`, `contracts/relayer/`, and `services/x402-provider/`. It covers the four-agent loop, Passport session usage, x402/PIEUSD payments on Kite testnet, Hyperlane bridging and messaging, market data inputs, Groq LLM reasoning, and the final vault rebalancing behavior.

Companion diagram: [`orca-aave-to-uniswap-kite-base-sepolia.excalidraw`](./orca-aave-to-uniswap-kite-base-sepolia.excalidraw).

## System Summary

ORCA is a multi-agent DeFi rebalancing demo:

1. Scout fetches market data, ranks yield opportunities, asks Groq to select a signal, pays Risk over x402 in PIEUSD, signs the signal, writes it to Redis, and records PoAI attribution on Kite.
2. Risk reads the Scout signal, re-fetches market/context data, asks Groq for a risk verdict, applies deterministic safety checks, pays Executor over x402 in PIEUSD, signs an instruction, and writes it to Redis.
3. Executor reads the Risk instruction, asks Groq for an execution route, optionally overrides routing deterministically, executes the vault movement path, pays Audit over x402 in PIEUSD, records PoAI attribution, and writes settlement metadata to Redis.
4. Audit reads Scout/Risk/Execution streams, asks Groq to score attribution, writes PoAI attribution, and emits audit workflow events.

The execution layer currently supports two cross-chain modes:

- `warp_to_stub`: the active demo path. Executor uses Hyperlane Warp Route to bridge USDT from Kite testnet to a destination stub vault on a spoke chain, then calls `syncWarpedDepositFor` on that stub to credit the beneficiary.
- `mailbox_oapp`: the legacy message path. Executor submits `ClientAgentVault.execute(...)` on Kite, which calls `ORCAOApp.executeCrossChainRebalance(...)`; Hyperlane Mailbox delivers a message to `RemoteAdapter` on the destination chain; the adapter pulls pre-bridged collateral from the beneficiary and calls `depositFor` on the destination stub vault.

PIEUSD is used for inter-agent x402 payments. USDT is used for portfolio collateral movement.

## Four Agents

### Scout Agent

Entrypoint: `agents/src/orca_scout/main.py` -> `ScoutRuntime`.

Core source files:

- `agents/src/orca_scout/scout_runtime.py`
- `agents/src/orca_scout/services/yield_scanner.py`
- `agents/src/orca_scout/services/opportunity_ranker.py`
- `agents/src/orca_scout/services/llm_opportunity_selector.py`
- `agents/src/orca_scout/services/execution_intent_builder.py`
- `agents/src/orca_scout/services/signal_broadcaster.py`
- `agents/src/orca_scout/services/passport_signer.py`
- `agents/src/orca_scout/services/poai_reporter.py`
- `agents/src/orca_scout/integrations/x402_client.py`
- `agents/src/orca_scout/integrations/passport_cli.py`

Scout startup:

- Connects to Redis.
- Builds market-data stack:
  - Hybrid mode: DefiLlama + Goldsky + Aave/Compound/Morpho/Uniswap enrichers.
  - Lucid mode: Lucid market feed + Goldsky.
- Builds optional bridge-fee estimator.
- Builds x402 client.
- Checks Passport CLI readiness.
- Checks Kite RPC / PoAI contract connectivity.
- Initializes `SignalBroadcaster`.

Scout loop:

1. Ensures an active Passport session via `kpass agent:session list`, `create`, `status --wait`, and `use`.
2. Calls `YieldScanner.scan()`.
3. Ranks opportunities.
4. Calls Groq through `LLMOpportunitySelector`.
5. Builds optional execution intent calldata.
6. Signs the signal.
7. Sends x402 payment to Risk.
8. Writes `scout.signal.created` to Redis.
9. Records Scout PoAI attribution on Kite.

The signal payload is modeled in `YieldSignal` and includes:

- `signal_id`
- `scout_did`
- source chain/protocol
- destination chain/protocol
- current APY, target APY, net delta APY
- suggested amount
- signature/timestamp
- optional `execution_intent`

### Risk Agent

Entrypoint: `agents/src/orca_risk/main.py` -> `RiskRuntime`.

Core source files:

- `agents/src/orca_risk/runtime.py`
- `agents/src/orca_risk/services/risk_context_builder.py`
- `agents/src/orca_risk/services/risk_llm_advisor.py`
- `agents/src/orca_common/llm/risk_verdict.py`

Risk startup:

- Connects to Redis.
- Checks Passport CLI readiness.
- Builds x402 client.
- Builds DID signer.
- Optionally connects to `ORCARegistry`.
- Builds Groq client.
- Builds market stack and risk context builder.

Risk loop:

1. Ensures active Passport session.
2. Reads new Scout signals from `SCOUT_REDIS_STREAM_KEY`.
3. Re-fetches market data and enrichments.
4. Fetches API context from `GET /internal/risk-context?signalId=...`.
5. Optionally checks `ORCARegistry` for Scout active status and vault.
6. Sends evidence to Groq with strict JSON output rules.
7. Applies deterministic risk gates:
   - `recommended_approved`
   - registry active
   - Scout DID allowlist
   - markets found for route
   - positive fresh net APY
   - positive signal net APY
   - APY drift within tolerance
   - minimum TVL
   - utilization below cap
8. Signs `RiskInstruction`.
9. Sends x402 payment to Executor.
10. Writes `risk.instruction.created` to Redis.

In demo mode, Risk still calls or templates an LLM deliberation, but code overrides the decision to approve.

### Executor Agent

Entrypoint: `agents/src/orca_executor/main.py` -> `ExecutorRuntime`.

Core source files:

- `agents/src/orca_executor/runtime.py`
- `agents/src/orca_executor/path_resolution.py`
- `agents/src/orca_executor/spoke_prep.py`
- `agents/src/orca_executor/vault_tx.py`
- `agents/src/orca_executor/services/executor_llm_advisor.py`

Executor startup:

- Connects to Redis.
- Checks Passport CLI readiness.
- Checks PoAI RPC connectivity.
- Optionally preflights spoke RPC URLs when `EXECUTOR_SUBMIT_VAULT_TX=true`.

Executor loop:

1. Ensures active Passport session.
2. Reads approved Risk instructions from `RISK_INSTRUCTION_STREAM_KEY`.
3. Requires `execution_intent`.
4. Sends instruction + intent to Groq for an execution path.
5. Optionally uses deterministic routing from `resolve_execution_path`.
6. Executes one of:
   - `kite_deposit`
   - `warp_to_stub`
   - `hub_bridge_then_vault` / `vault_only` legacy mailbox OApp
7. Records Executor PoAI attribution on Kite.
8. Sends x402 payment to Audit.
9. Writes `execution.settled` to Redis with related transaction hashes.
10. Posts Executor deliberation to `POST /internal/agent-deliberation`.

### Audit Agent

Entrypoint: `agents/src/orca_audit/main.py` -> `AuditRuntime`.

Core source files:

- `agents/src/orca_audit/runtime.py`
- `agents/src/orca_audit/services/audit_llm_advisor.py`

Audit loop:

1. Reads Scout, Risk, and Execution Redis streams.
2. Compacts each payload to a Groq-friendly audit payload.
3. Calls Groq for `value_delta` and anomaly summary.
4. Records PoAI attribution on Kite.
5. Writes audit workflow event to Redis.
6. Posts audit deliberation to API.

## Passport Session Usage

Passport session usage is implemented by `PassportCLI`.

Each payment-capable agent constructs `PassportCLI(config.passport_cli_bin, base_url=config.kite_passport_base_url)` and calls `ensure_active_session(...)` before doing useful work.

The command sequence is:

1. `kpass agent:session list --status active --output json --no-interactive`
2. If a matching session exists for configured assets, `kpass agent:session use --session-id <id>`.
3. If not, create one:
   - `kpass agent:session create`
   - `--task-summary <summary>`
   - `--max-amount-per-tx <max_per_tx>`
   - `--max-total-amount <max_total>`
   - `--ttl <ttl>`
   - `--assets <assets>`
   - `--payment-approach x402`
4. If creation returns a request id, wait:
   - `kpass agent:session status --request-id <id> --wait`
5. Refresh active sessions and `use` the selected session.

The session is then consumed by `X402Client` when execution mode is `passport`.

## x402 / Kite Payments

x402 payment source files:

- Agent client: `agents/src/orca_scout/integrations/x402_client.py`
- Direct executor helper: `agents/src/orca_scout/integrations/x402_direct_execute.py`
- Local provider: `services/x402-provider/src/server.ts`
- Provider docs: `services/x402-provider/README.md`
- API ingestion: `api/src/workers/stream-ingestor.ts`

Payment chain:

- Scout pays Risk before publishing signal.
- Risk pays Executor before publishing instruction.
- Executor pays Audit before publishing settlement.

The agent payment request body is:

```json
{
  "toDid": "did:kite:orca/risk-1",
  "amountWei": "1000000",
  "network": "kite-testnet",
  "asset": "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A",
  "memo": "signal:<signal_id>"
}
```

The x402 provider:

1. Receives `POST /execute`.
2. If no `X-Payment` header is present, returns HTTP 402 with `accepts[]`.
3. Uses payment requirements:
   - `scheme: exact`
   - `network: eip155:2368`
   - `asset: PIEUSD`
   - `amount: X402_MAX_AMOUNT_REQUIRED_WEI`
   - `payTo: X402_PAY_TO` or DID-specific mapping
4. In stub mode, returns a synthetic `txHash`.
5. In live mode, normalizes `X-Payment`, posts to Pieverse facilitator:
   - `POST /v2/verify`
   - `POST /v2/settle`
6. Returns settlement `txHash`.

The API stores these in `x402Payment` via `stream-ingestor.ts`.

## Market Data And External APIs

### DefiLlama

Source: `agents/src/orca_common/market/defillama_client.py`.

DefiLlama is the primary hybrid market feed. It calls the configured pools endpoint, commonly `/pools`, and parses rows into `YieldMarket`.

Normalization:

- DefiLlama APY is a percent, so `5.2` becomes `0.052`.
- APY must be positive and below `DEFILLAMA_MAX_APY_PERCENT`.
- TVL must be above `DEFILLAMA_MIN_TVL_USD`.
- Supported protocol mapping:
  - text containing `aave` -> `aave-v3`
  - text containing `compound` -> `compound-v3`
  - text containing `morpho` -> `morpho`
  - text containing `uniswap` -> `uniswap-v3`
- Chain names map to EVM chain IDs, including Kite testnet `2368`, Base `8453`, and Base Sepolia `84532`.

### Goldsky

Source:

- `agents/src/orca_common/market/goldsky_client.py`
- `indexer/goldsky-orca/orca-orca-subgraph.json`

Goldsky is pulled every Scout scan through `fetch_recent_protocol_events()`. The current query is lightweight and verifies the configured subgraph id. The indexer scaffold tracks `ORCARegistry` events such as `AgentRegistered`, `AgentStatusUpdated`, and `AgentVaultUpdated` on Kite AI testnet.

### Aave Enricher

Source: `AaveUtilizationEnricher`.

Calls Aave GraphQL:

- probes `chains { chainId name }`
- queries markets/reserves/borrow utilization

If live utilization is unavailable, falls back to `0.65`.

### Compound Enricher

Source: `CompoundUtilizationEnricher`.

Calls known Comet contracts with selector `0x7eb71131` (`getUtilization`) over public RPC for Ethereum, Base, Arbitrum, and Optimism mainnet. Falls back to `0.60`.

### Morpho Enricher

Source: `MorphoUtilizationEnricher`.

Calls Morpho GraphQL (`https://api.morpho.org/graphql` by default), reads market state utilization, and falls back to `0.55`.

### Uniswap Enricher

Source: `UniswapUtilizationEnricher`.

Calls DefiLlama DEX summary:

- default `https://api.llama.fi/summary/dexs/uniswap?dataType=dailyVolume`
- derives a utilization proxy from 24h volume / TVL
- falls back to `0.50`

### Bridge Fee API

Source: `BridgeFeeClient`.

When configured, calls a bridge fee endpoint with:

- `srcChainId`
- `dstChainId`
- `amount`
- asset param, default `assetSymbol`

It reads a response field, default `estimatedFeeUsdc`, and converts it into an annualized APY cost in `BridgeCostEstimator`.

### Lucid

Source: `LucidClient`.

Lucid is the legacy/fallback market feed when `SCOUT_MARKET_DATA_PROVIDER=lucid`.

### ORCA API

Risk calls:

- `GET /internal/risk-context?signalId=...`

Agents post deliberations:

- `POST /internal/agent-deliberation`

Relayer posts:

- `POST /internal/relayer-event`

Frontend/API consumers read:

- `GET /signals`
- `GET /signals/:id`
- `GET /signals/:id/workflow`
- `GET /me/vault-holdings`
- `POST /me/vault-holdings/refresh`

The API also ingests Redis streams into Postgres and broadcasts websocket updates.

## LLM Reasoning With Groq

Groq client source: `agents/src/orca_common/llm/groq_client.py`.

Every agent uses the same client shape:

- `POST <GROQ_BASE_URL>/chat/completions`
- `model: GROQ_MODEL`
- `temperature: 0`
- `response_format: { "type": "json_object" }`
- system prompt from `agents/src/orca_common/llm/prompts.py`
- user payload as JSON

The response must include:

- `reasoning_steps`
- `verdict`
- `verdict_summary`

The code stores a normalized `LlmDeliberation` in Redis events, API workflow events, and `agentDeliberation` records.

Agent-specific LLM responsibilities:

- Scout: choose one ranked opportunity.
- Risk: recommend approval/rejection using live evidence and preflight booleans.
- Executor: choose execution path, while deterministic routing can override it.
- Audit: score attribution and anomalies.

## Signal And Execution Intent Construction

The execution intent is built in `ExecutionIntentBuilder`.

For same-chain Kite deposits:

- Destination chain is Kite testnet `2368`.
- Scout ABI-encodes `deposit(uint256 amount)` for the Kite stub vault.
- Executor calls the stub directly.

For cross-chain intents:

- Scout resolves protocol addresses from `SCOUT_PROTOCOL_ADDRESS_MAP` or the stub manifest.
- Scout resolves `destination_adapter` from `HYP_TRUSTED_REMOTES`.
- Scout calls `ORCAOApp.quoteCrossChainRebalanceDispatchFee(...)` on Kite when `KITE_RPC_URL` is configured.
- Scout ABI-encodes:
  - `ORCAOApp.executeCrossChainRebalance(...)`
  - `ClientAgentVault.execute(ORCAOApp, value, oapp_calldata, amountForRule)`

Important fields:

- `vault_address`: Kite `ClientAgentVault`
- `target_address`: Kite `ORCAOApp`
- `tx_value_wei`: native Kite value for Hyperlane dispatch fee
- `amount_for_rule`: amount used by `SpendingRuleEnforcer`
- `from_protocol`: source stub/protocol address
- `to_protocol`: destination stub/protocol address
- `destination_domain`: destination Hyperlane domain / chain ID
- `destination_adapter`: destination `RemoteAdapter` bytes32
- `oapp_calldata`: inner OApp call
- `vault_execute_calldata`: outer vault call

## Hyperlane Integration

Hyperlane source areas:

- Scripts: `contracts/scripts/hyperlane/`
- Relayer: `contracts/relayer/`
- Snapshot: `hyperlane/outputs/snapshots/orca-integration.latest.json`
- Contracts: `ORCAOApp.sol`, `RemoteAdapter.sol`, `NoopISM.sol`

Configured domains:

- Kite testnet: `2368`
- Ethereum Sepolia: `11155111`
- Arbitrum Sepolia: `421614`
- Optimism Sepolia: `11155420`
- Base Sepolia: `84532`

Configured mailboxes from snapshot:

- Kite: `0x0d5b681C5887617d68200B45F3947c99Cf402188`
- Base Sepolia: `0x68e89453029DC14351bF72104dC30248BB766b69`
- Sepolia: `0xCDF3D9c1E132e4b37A362CF0f11f384b673Aa908`
- Arbitrum Sepolia: `0x25f442fd07fc3eaC3a27F3E6AcaaBa0f15F3dbaD`
- Optimism Sepolia: `0x0866f40D55E96b2D74995203Caff032aD81c14B0`

### Warp Route Path

Used by Executor when `EXECUTOR_CROSS_CHAIN_MODE=warp_to_stub`.

For Kite -> Base Sepolia USDT:

- Route id: `USDT/kitetestnet-basesepolia`
- Origin router on Kite: `0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc`
- Destination router / synthetic USDT on Base Sepolia: `0x2eD22aA87C87E4B0139552d50CB5B049E369C295`
- Origin token on Kite: `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`

Executor runs:

- `contracts/scripts/hyperlane/transfer-hub-to-dest.ts`
- calls `transferRemote(...)` in `warp.ts`
- quotes `quoteTransferRemote(...)` when supported
- approves origin router for required token amount
- calls `router.transferRemote(destinationDomain, recipientBytes32, amount)` with native fee

For the active demo, the recipient is the destination stub vault address, not the user wallet. After the relayer delivers the warp, the stub vault has unaccounted underlying. Executor then calls `syncWarpedDepositFor(beneficiary, amount)` so `principalOf[beneficiary]` is credited.

### Mailbox OApp Path

Used when Executor chooses / is configured for `mailbox_oapp`.

Kite:

1. Executor submits `ClientAgentVault.execute(...)`.
2. Vault checks:
   - caller is configured executor
   - `msg.value == value`
   - `SpendingRuleEnforcer.enforceRules(target, amountForRule)`
3. Vault calls `ORCAOApp.executeCrossChainRebalance(...)`.
4. OApp checks:
   - caller is the vault
   - destination remote is trusted
   - `LZBridgeGuard.requireApproval(transferId, amount)`
   - enough native fee for `mailbox.quoteDispatch(...)`
5. OApp dispatches Hyperlane message and emits `CrossChainRebalanceRequested`.

Relayer:

1. Watches Kite Mailbox `Dispatch` logs.
2. Filters destination domains and allowlisted recipients:
   - `RemoteAdapter` addresses
   - warp destination router addresses
3. Resolves ISM metadata.
4. Calls destination mailbox `process(metadata, message)`.
5. Posts relayer status to the API.

Base Sepolia:

1. Mailbox calls `RemoteAdapter.handle(...)`.
2. Adapter checks mailbox and trusted sender.
3. Adapter decodes payload.
4. Adapter pulls `collateralToken` from beneficiary via `transferFrom`.
5. Adapter approves destination stub vault.
6. Adapter calls `depositFor(beneficiary, amount)`.
7. Stub vault increments `principalOf[beneficiary]`.

## Vaults And Portfolio Rebalancing Logic

Vault manifest: `agents/config/orca-stub-protocols.json`.

Supported chains and protocols:

- Kite testnet `2368`
- Base Sepolia `84532`
- Arbitrum Sepolia `421614`
- Ethereum Sepolia `11155111`
- Optimism Sepolia `11155420`

Each chain has stub vaults for:

- Aave V3
- Compound V3
- Morpho
- Uniswap V3

Stub vault base contract: `OrcaStubYieldVaultBase`.

State model:

- `underlying`: collateral token, usually USDT for portfolio movement
- `apyBps`: simulated yield rate
- `principalOf[user]`: user principal credited in that vault
- `lastAccrualTs[user]`: accrual start
- `rewardReserve`: owner-funded yield float
- `accountedUnderlying`: amount already credited to principals

Final rebalancing behavior:

- Scout does not physically withdraw from the source vault in the current demo path.
- It creates a signal that describes a source protocol and destination protocol.
- Executor moves fresh collateral into the destination vault, either by direct Kite deposit, Hyperlane warp-to-stub, or legacy mailbox adapter deposit.
- The UI/API illustrates portfolio movement by reading destination vault holdings and workflow events.
- `GET /me/vault-holdings` calls `refreshVaultHoldings(wallet)`, which scans all manifest vaults across supported chains and reads `claimableOf(owner)` or `principalOf(owner)`.

This means the demo is best understood as “signal-driven allocation into the best destination vault” rather than a full atomic withdraw-from-source and deposit-to-destination rebalance.

## Concrete Example: Aave -> Uniswap V3, Kite -> Base Sepolia

Example signal:

- Source chain: Kite testnet `2368`
- Source protocol: `aave-v3`
- Source stub: `0x8fa6465cBd56Ab4Af4127E02525e987a123A38B2`
- Destination chain: Base Sepolia `84532`
- Destination protocol: `uniswap-v3`
- Destination stub: `0x4d15c615909D8Ce7abB09f87f1813dA75160dC5c`
- Kite USDT collateral: `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- Base Sepolia synthetic USDT: `0x2eD22aA87C87E4B0139552d50CB5B049E369C295`
- Kite USDT warp router: `0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc`
- Base Sepolia mailbox: `0x68e89453029DC14351bF72104dC30248BB766b69`
- Base Sepolia RemoteAdapter: `0x8c1fC785b71A6a095878fB49BDdcb5788D553C2D`

Active `warp_to_stub` execution:

1. Scout observes feed APY for Aave and Uniswap V3, maps feed chains to testnet stubs, ranks Uniswap V3 Base Sepolia as the target, and asks Groq to select it.
2. Scout pays Risk in PIEUSD through x402.
3. Scout publishes a signed signal with execution intent.
4. Risk rebuilds evidence and asks Groq for a risk verdict.
5. Risk approves, pays Executor in PIEUSD through x402, and publishes instruction.
6. Executor asks Groq for execution path. Deterministic routing resolves `warp_to_stub` because destination is a spoke and `to_protocol` is a valid Base Sepolia stub address.
7. Executor runs Hyperlane script with:
   - `HYP_DEST=basesepolia`
   - `HYP_WARP_ASSET=USDT`
   - `RECIPIENT=0x4d15c615909D8Ce7abB09f87f1813dA75160dC5c`
   - `AMOUNT=<suggested_amount>`
8. Script approves Kite USDT router and calls `transferRemote(84532, recipientBytes32, amount)`.
9. Relayer observes Kite Mailbox dispatch and processes destination mailbox delivery.
10. Base Sepolia destination router mints/releases synthetic USDT to the Uniswap V3 stub vault.
11. Executor waits, then calls `syncWarpedDepositFor(beneficiary, amount)` on `OrcaUniswapV3StubVault`.
12. Stub vault increments `principalOf[beneficiary]`.
13. Executor records PoAI, pays Audit in PIEUSD, and emits `execution.settled`.
14. API ingests settlement, related txs, x402 payments, and workflow events.
15. Frontend/API refreshes vault holdings and shows Base Sepolia Uniswap V3 balance.

Legacy mailbox OApp execution for the same logical signal:

1. Scout encodes `ORCAOApp.executeCrossChainRebalance(84532, baseRemoteAdapterBytes32, kiteAaveStub, baseUniStub, beneficiary, amount, hookMetadata)`.
2. Scout wraps that call in `ClientAgentVault.execute(ORCAOApp, txValue, oappCalldata, amountForRule)`.
3. Executor ensures beneficiary has Base Sepolia synthetic USDT and allowance to `RemoteAdapter`.
4. Executor submits the vault transaction on Kite.
5. OApp dispatches a Hyperlane message to Base Sepolia `RemoteAdapter`.
6. Relayer delivers the message.
7. `RemoteAdapter` pulls synthetic USDT from beneficiary and calls `depositFor` on the Uniswap V3 stub vault.

## API Persistence And UI Workflow

Redis streams:

- Scout signals: `orca:signals:scout` by default
- Risk instructions: `orca:instructions:risk` by default
- Executor settlements: `orca:executions:executor` by default
- Audit events: `orca:audit` by default
- Relayer events: `orca:relayer` by default

API worker: `api/src/workers/stream-ingestor.ts`.

Persistence:

- `Signal`
- `RiskInstruction`
- `Execution`
- `WorkflowEvent`
- `X402Payment`
- `RelayerMessage`
- `VaultHolding`

Workflow page data comes from:

- `GET /signals/:id/workflow`

Portfolio holdings come from:

- `GET /me/vault-holdings`
- `POST /me/vault-holdings/refresh`

## Excalidraw Component Inventory

The companion Excalidraw file contains these components:

1. User / Portfolio Owner: the beneficiary whose vault principal is credited.
2. Frontend Dashboard: reads workflow and vault holdings from the API.
3. ORCA API: serves signal workflow, risk context, positions, vault holdings, and websocket updates.
4. Postgres / Prisma: stores signals, instructions, executions, payments, relayer messages, agent deliberations, and vault holdings.
5. Redis Streams: event bus between agents and API ingestor.
6. Scout Agent: data scanner, ranker, Groq selector, signer, x402 payer, signal publisher.
7. Risk Agent: risk context builder, Groq risk officer, deterministic gates, x402 payer, instruction publisher.
8. Executor Agent: Groq execution planner, deterministic path resolver, Hyperlane caller, PoAI reporter, x402 payer.
9. Audit Agent: Groq audit scorer and PoAI attribution writer.
10. Groq API: JSON reasoning backend for all four agents.
11. DefiLlama: yield pools and Uniswap DEX volume inputs.
12. Aave GraphQL / Compound RPC / Morpho GraphQL / Uniswap volume: utilization enrichers.
13. Goldsky: ORCA registry/indexer event source.
14. Bridge Fee API: optional bridge-cost adjustment for ranking.
15. Passport CLI / Kite Passport: session creation, active session selection, and x402 execution authority.
16. x402 Provider: HTTP 402 payment challenge and settlement endpoint.
17. Pieverse Facilitator: x402 verify/settle for PIEUSD payments.
18. PIEUSD on Kite: inter-agent payment asset.
19. PoAIAttribution on Kite: on-chain attribution ledger for Scout, Executor, and Audit actions.
20. Kite USDT: portfolio collateral on Kite.
21. Kite Aave V3 Stub Vault: source protocol in the example.
22. Kite Hyperlane Mailbox: dispatch origin for warp and OApp message flow.
23. Kite USDT Warp Router: origin router for USDT transfer to Base Sepolia.
24. ClientAgentVault: guarded executor vault for the legacy OApp path.
25. SpendingRuleEnforcer: target whitelist and budget/per-transaction checks.
26. LZBridgeGuard: cross-chain amount approval check used by OApp.
27. ORCAOApp: legacy cross-chain message dispatcher.
28. ORCA Relayer: watches Kite dispatch logs and calls destination mailbox processing.
29. Base Sepolia Mailbox: destination Hyperlane mailbox.
30. Base Sepolia USDT Router / Synthetic USDT: destination side of the USDT warp route.
31. Base RemoteAdapter: legacy message recipient that pulls beneficiary collateral and deposits.
32. Base Uniswap V3 Stub Vault: destination vault credited in the example.
33. Base Aave / Compound / Morpho Stub Vaults: other supported Base Sepolia destination protocols.
34. Other Spoke Vault Sets: Sepolia, Arbitrum Sepolia, and Optimism Sepolia protocol vaults.
35. Execution Settled Event: final Redis/API event with related tx hashes.

## Operational Notes

- `EXECUTOR_SUBMIT_VAULT_TX=true` is required for real on-chain execution.
- `EXECUTOR_CROSS_CHAIN_MODE=warp_to_stub` selects the current demo cross-chain path.
- `SCOUT_CROSS_CHAIN_BENEFICIARY` should usually be the executor/user EOA that can be credited and can sign required spoke actions.
- `SCOUT_STUB_CHAIN_RPC_MAP` or `EXECUTOR_STUB_CHAIN_RPC_MAP` must include the destination chain RPC for spoke follow-up calls.
- `HYPERLANE_INTEGRATION_SNAPSHOT` must contain the selected warp route.
- `HYP_WARP_ASSET` should be `USDT` for portfolio collateral movement; PIEUSD routes exist but PIEUSD is payment-only in this repo’s rebalancing path.
- The relayer allowlists both `RemoteAdapter` recipients and warp destination router recipients.
- The API portfolio reader does not infer “withdraw from source”; it reads actual vault principal/claimable balances across all manifest vaults.
