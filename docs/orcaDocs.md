  ORCA  
On-chain Risk Coordination Architecture
Full-Stack Engineering Requirements Document  •  Built on Kite AI

Version 1.0  |  Agentic Trading Track  |  Track: Kite AI Hackathon


Table of Contents

  01  Project Overview & Scope  
1.1  What Is ORCA?
ORCA (On-chain Risk Coordination Architecture) is a fully autonomous DeFi position management protocol built natively on the Kite AI Layer-1 blockchain. It deploys a coordinated swarm of four specialized AI agents — Scout, Risk, Executor, and Audit — each holding a Kite Agent Passport DID, operating inside an ERC-4337 ClientAgentVault with on-chain spending constraints, and settling every inter-agent payment via Kite's x402 state-channel micropayment protocol.
Cross-chain rebalancing (Ethereum, Arbitrum, Optimism, Base, Avalanche) is handled atomically via Hyperlane mailbox messaging and Warp Routes. Treasury governance runs through an Ash/Safe multisig with TimelockGuard. Every agent action is attributed to the PoAI on-chain ledger, enabling permissionless contribution and proportional KITE reward distribution.
1.2  Goals
⦁	Replace opaque, monolithic DeFi bots with a transparent, auditable, incentive-aligned agent swarm
⦁	Enforce all risk constraints cryptographically on-chain — not in application code
⦁	Enable a marketplace of permissionless Scout and Risk agents rewarded by PoAI attribution
⦁	Provide the portfolio owner with passkey-gated session approval and a real-time dashboard
⦁	Settle all agent-to-agent payments in USDC via x402 at sub-cent cost on Kite L1
1.3  Non-Goals
⦁	ORCA does not custody or custody-bridge user funds off Kite without multisig quorum
⦁	ORCA does not provide investment advice — it executes within owner-defined risk parameters
⦁	ORCA does not support non-EVM chains in v1
1.4  High-Level Architecture
The system comprises five primary layers:
1.	Frontend (Next.js 14 / React) — owner dashboard, session approval, position monitoring
2.	Backend API (Node.js / Fastify) — agent orchestration, event bus, DB persistence
3.	Agent Runtime (Python / LangChain) — four specialized agents with on-chain signing
4.	Kite On-Chain Layer — Passport registry, AA vaults, x402 channels, multisig, PoAI
5.	Cross-Chain Layer — Hyperlane mailbox contracts on Kite + remote chain adapters

Component	Technology	Kite Feature Used
Frontend	Next.js 14, wagmi v2, RainbowKit	Agent Passport session UI, passkey approval
Backend API	Node.js, Fastify, Prisma, Redis	Event relay for on-chain Kite events
Agent Runtime	Python 3.11, LangChain, web3.py	x402 payments, AA SDK, Passport signing
Smart Contracts	Solidity 0.8.24, Hardhat	ClientAgentVault, SpendingRules, PoAI hooks
Cross-chain	Hyperlane Mailbox + Warp Routes	Kite domain 2368, trusted sender config
Database	PostgreSQL 16, Redis 7	Agent action log, yield snapshots
Indexer	Goldsky subgraph + webhook	Real-time Kite L1 event streaming
Oracles	APRO on Kite, Chainlink (remote)	Price feeds for collateral valuation

  02  Kite AI Modules & Integration Points  
2.1  Agent Passport (DID Identity Layer)
Every agent in the ORCA swarm receives a unique Kite Agent Passport at deployment time. The Passport provides a cryptographically verifiable DID that links back to the portfolio owner's root key through a delegated key hierarchy.
[KM-01]  Kite Passport SDK  —  Identity / On-chain
Install and configure the Kite Passport CLI + SDK. Register one Passport per agent type (Scout, Risk, Executor, Audit). Each Passport holds a funded USDC wallet, scoped spending session, and service discovery capabilities.
⦁	Install via: curl -fsSL https://agentpassport.ai/install.sh | bash
⦁	Each agent calls kpass user create --agent-type <scout|risk|executor|audit>
⦁	Spending sessions approved by portfolio owner passkey before each epoch
⦁	Sessions carry: budget ceiling, time-to-live, approved provider addresses, max-per-tx cap
⦁	Selective disclosure: agents prove they belong to a verified human without revealing which human

Reference Documentation:
⦁	Kite Agent Passport — Introduction: https://docs.gokite.ai/kite-agent-passport/kite-agent-passport
⦁	Kite Agent Passport — Developer Guide: https://docs.gokite.ai/kite-agent-passport/developer-guide
⦁	Kite Agent Passport — Service Provider Guide: https://docs.gokite.ai/kite-agent-passport/service-provider-guide
⦁	Kite Agent Passport — CLI Reference: https://docs.gokite.ai/kite-agent-passport/cli-reference
⦁	Kite Agent Passport — Funding: https://docs.gokite.ai/kite-agent-passport/funding

2.2  Account Abstraction SDK (ERC-4337)
Each agent deploys a ClientAgentVault — an upgradeable UUPS proxy smart wallet on Kite L1 — using the gokite-aa-sdk. The vault enforces spending rules at the contract layer, enabling gasless bundled transactions for the Executor Agent.
[KM-02]  gokite-aa-sdk  —  Smart Contract / Payments
Deploy and configure one ClientAgentVault per agent. Set per-agent spending rules: daily budget cap, time window, whitelisted provider addresses. The Executor Agent constructs batched UserOperations (multi-step DeFi actions + bridge calls) as a single atomic operation.
⦁	npm install gokite-aa-sdk
⦁	GokiteAASDK initialized with Kite RPC + bundler RPC endpoints
⦁	sdk.sendUserOperationAndWait() used for all agent-initiated transactions
⦁	Batch operations: harvest yield + swap rewards + bridge + redeposit in one UserOperation
⦁	Vault upgrade path via UUPS proxy — owner can upgrade logic without redeploying

Spending Rule Configuration Example:
rules = [{ timeWindow: 86400n,  // 24-hour rolling window
          budget: parseUnits('5000', 6),  // $5,000 USDC cap per day
          initialWindowStartTime: epochStart,
          targetProviders: [AAVE_ADDR, COMPOUND_ADDR, MORPHO_ADDR] }]

Reference Documentation:
⦁	Account Abstraction SDK: https://docs.gokite.ai/kite-chain/account-abstraction-sdk
⦁	ERC-4337 Specification: https://eips.ethereum.org/EIPS/eip-4337
⦁	NPM: gokite-aa-sdk: https://www.npmjs.com/package/gokite-aa-sdk

2.3  Kite Stablecoin & Gasless Transfers (x402 / AP2)
All inter-agent payments and DeFi settlements use USDC on Kite via the x402 state-channel protocol. Two on-chain transactions (open and close) enable thousands of signed off-chain updates, achieving sub-$0.000001 cost per agent-to-agent call.
[KM-03]  x402 State Channels  —  Payments / L1
Open a persistent x402 payment channel between each agent pair: Scout→Risk, Risk→Executor, Executor→Audit. Every time Scout delivers a yield signal to Risk, it sends a micropayment. This creates market incentives for high-quality signals without custody risk.
⦁	Channel open: two on-chain txs at epoch start
⦁	Off-chain signed updates per signal delivery (<100ms latency)
⦁	Channel close: on-chain settlement at epoch end, net USDC transferred
⦁	Gasless USDC transfers via Kite native stablecoin module (no ETH needed for gas)

Reference Documentation:
⦁	Kite Stablecoin / Gasless Transfer: https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer
⦁	Kite Gasless Integration: https://docs.gokite.ai/kite-chain/9-gasless-integration
⦁	x402 Protocol Overview (Kite Whitepaper): https://gokite.ai/kite-whitepaper

2.4  Multisig Treasury (Ash / Safe Fork on Kite L1)
The ORCA treasury vault is a 3-of-5 Ash multisig deployed on Kite L1. Signers include 2 human operators and 3 high-reputation agent Passports. A TimelockGuard enforces a 48-hour delay on withdrawals above the threshold. The bridge guard prevents any high-value cross-chain fund movement without multisig quorum.
[KM-04]  Ash Multisig Wallet  —  Governance / Treasury
Deploy via https://wallet.ash.center/?network=kite. Configure 3-of-5 signers, TimelockGuard module, and bridge guard hook. All yield accruals flow into the multisig. Epoch-end PoAI reward distributions are batched through the multisig BatchTransfer module.
⦁	Deployment: Ash wallet UI → Create new Smart Account → 3-of-5 threshold
⦁	TimelockGuard: delay = 48h for withdrawals > $10,000 USDC
⦁	Bridge guard: halts large outbound bridge transfers until quorum approves destination
⦁	Alert webhooks: route Ash event logs to Slack/PagerDuty for signer notification
⦁	Signer rotation playbook: tested quarterly with hardware key holders

Reference Documentation:
⦁	Ash Multisig Wallet on Kite: https://docs.gokite.ai/kite-chain/multisig-wallet
⦁	Ash Wallet Interface: https://wallet.ash.center/?network=kite
⦁	Safe Core SDK (upstream): https://github.com/safe-global/safe-core-sdk

2.5  Hyperlane — Cross-Chain Execution
Cross-chain rebalancing (e.g., exit Aave on Ethereum, enter Morpho on Arbitrum) is executed atomically via Hyperlane mailbox messaging and Warp Routes. ORCA deploys mailbox-integrated contracts on Kite plus destination-chain adapters that process trusted origin messages.
[KM-05]  Hyperlane Mailbox + Warp Route  —  Cross-chain
Deploy Hyperlane core contracts and route contracts on Kite and each remote chain. Executor Agent constructs cross-chain messages to move settlement tokens and execute destination deposits. The bridge guard remains attached to the Kite-side dispatch path for high-value approvals.
⦁	Kite testnet Mailbox: 0x0d5b681C5887617d68200B45F3947c99Cf402188
⦁	Base Sepolia Mailbox: 0x68e89453029DC14351bF72104dC30248BB766b69
⦁	Kite Domain ID: 2368 / Base Sepolia Domain ID: 84532
⦁	Trusted senders must be configured for each origin domain before messages can flow
⦁	Message payload versioning includes a schema version byte for future upgrades

Reference Documentation:
⦁	Hyperlane Protocol Documentation: https://docs.hyperlane.xyz/docs/protocol/protocol-overview
⦁	Hyperlane Warp Route Overview: https://docs.hyperlane.xyz/docs/protocol/warp-routes/warp-routes-overview
⦁	Hyperlane CLI: https://docs.hyperlane.xyz/docs/reference/developer-tools/cli

2.6  Proof of Attributed Intelligence (PoAI)
Every agent action — yield signal, risk evaluation, trade execution — is recorded to the PoAI on-chain ledger via the Kite Audit Agent. At epoch end, the PoAI engine distributes KITE rewards proportional to each agent's verified contribution value (signal accuracy, P&L attribution, risk events prevented).
[KM-06]  PoAI Reward Hooks  —  Attribution / Incentives
The Audit Agent calls the PoAI registry contract after each agent action, submitting a structured attribution record: agent DID, action type, timestamped outcome hash. At epoch end, the PoAI distribution contract calculates Shapley-value-approximated rewards and routes KITE tokens to each agent's Passport wallet.
⦁	Attribution record schema: { agentDID, actionType, inputHash, outcomeHash, valueDelta }
⦁	Epoch length: configurable (default 24h)
⦁	Permissionless Scout market: any external agent can register as a Scout and earn PoAI rewards
⦁	Sybil resistance: new agents require a staked KITE bond before joining the Scout marketplace

Reference Documentation:
⦁	Kite Tokenomics & PoAI: https://docs.gokite.ai/get-started-why-kite/tokenomics
⦁	Kite Architecture & Design Pillars: https://docs.gokite.ai/get-started-why-kite/architecture-and-design-pillars
⦁	Kite Whitepaper (PoAI section): https://gokite.ai/kite-whitepaper

2.7  Goldsky Indexer Integration
Goldsky provides real-time subgraph indexing and webhook event delivery for Kite L1. ORCA uses Goldsky to subscribe to: vault balance changes, spending rule triggers, PoAI reward distributions, and Hyperlane message confirmations.
[KM-07]  Goldsky Subgraph + Webhooks  —  Data / Indexing
Deploy a Goldsky subgraph that tracks ORCA-specific events: SpendingRuleBreach, AgentVaultDeposit, PoAIAttributionRecord, CrossChainRebalanceRequested, CrossChainMessageReceived. Webhooks push events to the ORCA backend in real-time, which forwards them to the frontend via WebSocket.

Reference Documentation:
⦁	Goldsky-Kite AI Integration: https://docs.gokite.ai/kite-chain/11-goldsky-kite-integration
⦁	Goldsky Documentation: ⦁	https://docs.goldsky.com

2.8  Hybrid Market Data Layer
ORCA Scout uses a hybrid data layer that combines DefiLlama as a broad multi-chain APY/TVL feed with protocol-specific enrichers for utilization and protocol nuances. This keeps data structured for agent reasoning while avoiding a single-provider dependency.
[KM-08]  Hybrid Scout Data Access  —  Data / AI-native
Scout Agent queries DefiLlama for yield rates/TVL and enriches utilization context through Aave, Compound, Morpho, and Uniswap-specific adapters where available. The output remains structured JSON suitable for LLM context windows and ranking.

Reference Documentation:
⦁	DefiLlama API Docs: https://api-docs.defillama.com/
⦁	Lucid-Kite AI Integration (legacy fallback): https://docs.gokite.ai/kite-chain/12-lucid-kite-integration


  03  Smart Contract Layer  
3.1  Contract Architecture Overview
Contract	Chain	Purpose	Inherits / Uses
ORCARegistry	Kite L1	Central registry: agent DIDs, vault addresses, epoch state	Ownable, IPassportRegistry
ClientAgentVault	Kite L1	ERC-4337 smart wallet per agent with spending rules	gokite-aa-sdk, UUPS
SpendingRuleEnforcer	Kite L1	On-chain budget/time/provider enforcement module	ClientAgentVault module
PoAIAttribution	Kite L1	Records agent action attribution + epoch reward calc	Kite PoAI hooks
ORCAMultisigTreasury	Kite L1	3-of-5 Ash multisig wrapping main yield vault	Ash Safe fork
LZBridgeGuard	Kite L1	Halts large outbound bridge operations unless multisig quorum	Approval guard hook
ORCAOApp	Kite L1	Hyperlane dispatch/receive entry for cross-chain rebalance	Mailbox dispatch + trusted sender checks
RemoteAdapter	Each remote chain	Executes DeFi ops on Hyperlane message receipt	IMessageRecipient + Aave/Compound IFace
x402ChannelManager	Kite L1	Opens/closes state channels between agent pairs	Kite x402 protocol

3.2  ORCARegistry.sol
The central coordination contract. Maintains a mapping of agent DID → vault address, tracks epoch start timestamps, and emits events that Goldsky indexes.
function registerAgent(bytes32 did, address vault, AgentType agentType) external onlyOwner
function startEpoch(uint256 epochId) external onlyOwner
function getVaultForAgent(bytes32 did) external view returns (address)
⦁	Events: AgentRegistered, EpochStarted, EpochEnded
⦁	Access control: only ORCAMultisigTreasury can call registerAgent

3.3  SpendingRuleEnforcer.sol
A module attached to each ClientAgentVault. Every outbound transaction from an agent vault passes through this enforcer, which checks the rolling 24-hour spend total, per-transaction cap, and provider whitelist.
function enforceRules(address provider, uint256 amount) external view returns (bool)
function updateSpendingWindow(uint256 amount) external onlyVault
⦁	Circuit breaker: if 3 consecutive rule breaches, vault is auto-paused for 1 hour
⦁	Emits SpendingRuleBreach event on any violation (Goldsky indexed)

3.4  PoAIAttribution.sol
Records every agent action as an attribution record. At epoch end, computes reward shares using a simplified Shapley approximation over the trade P&L and risk events prevented.
struct AttributionRecord {
  bytes32 agentDID;
  ActionType actionType;  // SIGNAL | RISK_EVAL | EXECUTION | AUDIT
  bytes32 inputHash;
  bytes32 outcomeHash;
  int256 valueDelta;      // P&L contribution in USDC (6 decimals)
  uint256 timestamp;
}
function recordAction(AttributionRecord calldata record) external onlyRegisteredAgent
function distributeEpochRewards(uint256 epochId) external onlyOwner

3.5  ORCAOApp.sol (Hyperlane)
The Kite-side cross-chain entrypoint. The Executor Agent calls executeCrossChainRebalance(), which serializes the rebalance instruction and dispatches it to the destination RemoteAdapter via Hyperlane mailbox.
function executeCrossChainRebalance(
  uint32 dstDomain,       // Hyperlane destination domain ID
  bytes32 destinationAdapter,
  address fromProtocol,   // e.g. Aave v3 on Ethereum
  address toProtocol,     // e.g. Morpho on Arbitrum
  uint256 amount,         // USDC amount to rebalance
  bytes calldata options  // Hook metadata/options
) external onlyExecutorVault
⦁	Requires LZBridgeGuard approval for amounts > $50,000 USDC
⦁	Trusted remote must be set for each destination domain before calls can proceed
⦁	handle on RemoteAdapter handles: withdraw from old protocol, bridge USDC, deposit to new protocol

Reference Documentation:
⦁	Kite Network Information (Chain ID, RPC): https://docs.gokite.ai/kite-chain/1-getting-started/network-information
⦁	Smart Contracts List: https://docs.gokite.ai/kite-chain/3-developing/smart-contracts-list
⦁	Building dApps on Kite: https://docs.gokite.ai/kite-chain/4-building-dapps
⦁	Kite Chain Security Reference: https://docs.gokite.ai/kite-chain/6-reference

  04  Agent Runtime Layer  
4.1  Technology Stack
⦁	Runtime: Python 3.11 with asyncio
⦁	Agent framework: LangChain 0.2 (for LLM reasoning chains + tool calling)
⦁	Blockchain: web3.py 6.x for Kite L1 and remote chain interactions
⦁	Kite SDK: gokite-aa-sdk (Node.js, called via subprocess or REST bridge)
⦁	Message queue: Redis Streams for inter-agent event passing
⦁	Containerization: Docker + docker-compose for local dev; Kubernetes for prod

4.2  Agent 1 — Scout Agent
The Scout Agent is a continuously running process that monitors yield opportunities across 6+ chains and delivers signed signals to the Risk Agent via x402 micropayment.
[AG-01]  Scout Agent  —  Agent Runtime
Scans Goldsky + hybrid market data every 60 seconds. For each chain, computes net yield after bridge gas cost. Emits a YieldSignal struct if the opportunity delta exceeds the configurable threshold.
Scout Agent Modules:
Module ID	Name	Responsibility
SC-01	YieldScanner	Queries DefiLlama + protocol enrichers for APY/TVL/utilization across Aave, Compound, Morpho, Uniswap v3 pools
SC-02	BridgeCostEstimator	Calls bridge quote estimator for each potential rebalance route
SC-03	OpportunityRanker	Computes net yield delta = (target APY - current APY) - annualized bridge cost
SC-04	SignalBroadcaster	Serializes YieldSignal, sends x402 micropayment to Risk Agent, pushes to Redis Stream
SC-05	PassportSigner	Signs every outbound message with Scout's Passport DID private key
SC-06	PoAIReporter	Calls PoAIAttribution.recordAction() after each accepted signal

class YieldSignal(TypedDict):
  signal_id: str              # UUID
  scout_did: str              # Kite Passport DID
  src_chain: int              # EVM chain ID
  dst_chain: int              # EVM chain ID
  src_protocol: str           # 'aave-v3' | 'compound-v3' | 'morpho'
  dst_protocol: str
  current_apy: Decimal        # 18-decimal fixed
  target_apy: Decimal
  net_delta_apy: Decimal      # After bridge cost
  suggested_amount: int       # USDC (6 decimals)
  signature: str              # EIP-712 signed by Scout DID key
  timestamp: int

Reference Documentation:
⦁	DefiLlama API Docs: https://api-docs.defillama.com/
⦁	Goldsky-Kite AI Integration: https://docs.gokite.ai/kite-chain/11-goldsky-kite-integration
⦁	LangChain Python Docs: https://python.langchain.com/docs/introduction/

4.3  Agent 2 — Risk Agent
The Risk Agent receives YieldSignals from Scout(s), validates them against live collateral data from APRO oracles, and decides whether to approve or reject each rebalance. It enforces all on-chain spending rules before passing an instruction to the Executor.
[AG-02]  Risk Agent  —  Agent Runtime
Subscribes to the Scout signal Redis Stream. For each signal, pulls APRO oracle price data, calculates current portfolio collateral ratio, simulates the post-rebalance state, and either approves or rejects. Approved signals become ExecutionInstructions.
Risk Agent Modules:
Module ID	Name	Responsibility
RK-01	SignalValidator	Verifies Scout DID signature (EIP-712). Checks Scout is a registered PoAI agent.
RK-02	CollateralMonitor	Fetches live collateral ratios from APRO oracle on Kite. Computes health factor across all open positions.
RK-03	LiquidationDefender	If any position health factor < 1.15, overrides Scout signal with emergency top-up or unwind instruction.
RK-04	SpendingRuleChecker	Calls SpendingRuleEnforcer.enforceRules() read-only before approving. Rejects if budget window would be exceeded.
RK-05	RebalanceSimulator	Simulates post-rebalance portfolio state: new APY, new collateral ratios, projected 24h yield.
RK-06	InstructionSigner	Signs the ExecutionInstruction with Risk Agent Passport DID. Sends x402 payment to Executor Agent.
RK-07	PoAIReporter	Records risk evaluation outcome to PoAIAttribution.recordAction().

Reference Documentation:
⦁	APRO Oracle on Kite (from Kite Architecture docs): https://docs.gokite.ai/get-started-why-kite/architecture-and-design-pillars
⦁	Account Abstraction SDK — Spending Rules: https://docs.gokite.ai/kite-chain/account-abstraction-sdk

4.4  Agent 3 — Executor Agent
The Executor Agent holds the only ClientAgentVault with permission to call DeFi protocols and the ORCAOApp. It receives signed ExecutionInstructions from the Risk Agent and constructs the minimal set of on-chain operations to execute the rebalance.
[AG-03]  Executor Agent  —  Agent Runtime
Receives ExecutionInstruction from Risk Agent (validated DID signature). Constructs batched UserOperation via AA SDK. For cross-chain rebalances, calls ORCAOApp.executeCrossChainRebalance() which triggers Hyperlane mailbox dispatch. Monitors cross-chain message delivery and reports success/failure to Audit Agent.
Executor Agent Modules:
Module ID	Name	Responsibility
EX-01	InstructionVerifier	Verifies Risk Agent DID signature on ExecutionInstruction. Confirms spending rule check is still valid (rules can change).
EX-02	UserOpBuilder	Constructs ERC-4337 UserOperation: approve, withdraw, bridge, deposit — batched into single op via sdk.sendUserOperationAndWait()
EX-03	LocalChainExecutor	Handles same-chain rebalances: direct DeFi protocol calls via AA batch.
EX-04	CrossChainExecutor	Calls ORCAOApp.executeCrossChainRebalance(). Monitors Hyperlane message delivery via relay/explorer telemetry.
EX-05	SessionManager	Manages Passport spending session. If budget is exhausted, requests new session approval from owner via WebSocket push.
EX-06	SlippageGuard	Checks post-execution balances vs expected. If slippage > 0.5%, emits alert and pauses for Risk Agent review.

Reference Documentation:
⦁	Account Abstraction SDK — Batch Operations: https://docs.gokite.ai/kite-chain/account-abstraction-sdk
⦁	Hyperlane Protocol Docs: https://docs.hyperlane.xyz/docs/protocol/protocol-overview

4.5  Agent 4 — Audit Agent
The Audit Agent is a passive observer that maintains an immutable, signed log of every system action. It writes attribution records to PoAIAttribution.sol and triggers epoch reward distribution at the end of each epoch. It is the only agent whose Passport has write access to the PoAI contract.
[AG-04]  Audit Agent  —  Agent Runtime
Subscribes to all Redis Streams (Scout signals, Risk decisions, Executor transactions). For each event, constructs an AttributionRecord and calls PoAIAttribution.recordAction(). At epoch end (configurable, default 24h), calls distributeEpochRewards() via multisig proposal.
Audit Agent Modules:
Module ID	Name	Responsibility
AU-01	EventSubscriber	Redis Streams consumer for all agent event types.
AU-02	AttributionRecordBuilder	Constructs AttributionRecord structs from events. Hashes input/output data for immutable proof.
AU-03	PoAIWriter	Calls PoAIAttribution.recordAction() on Kite L1 for each event.
AU-04	EpochManager	Tracks epoch boundaries. At epoch end, calls Goldsky to aggregate all epoch records, then submits distributeEpochRewards() as a multisig proposal.
AU-05	ComplianceLogger	Writes full action trace to PostgreSQL for off-chain compliance and dispute resolution.

  05  Backend API Layer  
5.1  Technology Stack
⦁	Runtime: Node.js 20 LTS
⦁	Framework: Fastify 4 (performance-critical; handles agent event relay)
⦁	ORM: Prisma 5 + PostgreSQL 16
⦁	Cache / Message Bus: Redis 7 (Redis Streams for agent events, Redis Cache for yield data)
⦁	WebSocket: Fastify WebSocket plugin (real-time frontend updates)
⦁	Authentication: JWT + Ethereum SIWE (Sign-In With Ethereum) for owner login
⦁	Queue: BullMQ (epoch reward jobs, alert notifications)
⦁	Blockchain client: ethers.js v6 (Kite L1 + remote chains)

5.2  API Modules
Module ID	Name	Routes / Responsibility
BE-01	Auth Module	POST /auth/nonce, POST /auth/verify (SIWE). Issues JWT for dashboard access.
BE-02	Session Module	GET /sessions, POST /sessions/approve, DELETE /sessions/:id. Relays Passport session approvals from owner to agent runtime.
BE-03	Position Module	GET /positions, GET /positions/:id/history. Aggregates open DeFi positions across all chains via Goldsky + APRO.
BE-04	Agent Module	GET /agents, GET /agents/:did/actions. Returns agent status, Passport DID, vault balance, spending rule state.
BE-05	Signal Module	GET /signals, GET /signals/:id. Returns Scout yield signals with Risk approval/rejection decisions.
BE-06	Treasury Module	GET /treasury/balance, GET /treasury/multisig/pending. Multisig pending proposals and USDC vault balance.
BE-07	PoAI Module	GET /poai/epoch/:id/rewards, GET /poai/agents/:did/history. PoAI attribution records and reward distributions.
BE-08	Alerts Module	POST /alerts/webhook (from Goldsky), GET /alerts. Internal alert bus + owner notification (email/Slack).
BE-09	WebSocket Gateway	ws://api/ws — pushes real-time events: new signal, trade executed, alert triggered, session expired.

5.3  Data Models (PostgreSQL)
Core Tables:
⦁	agents: id, did, agent_type, vault_address, passport_session_id, created_at
⦁	signals: id, scout_did, src_chain, dst_chain, src_protocol, dst_protocol, net_delta_apy, status, created_at
⦁	executions: id, signal_id, executor_did, tx_hash, lz_message_id, status, slippage_bps, created_at
⦁	positions: id, chain_id, protocol, asset, amount_usdc, apy, health_factor, last_updated
⦁	attribution_records: id, agent_did, action_type, input_hash, outcome_hash, value_delta, epoch_id, block_number
⦁	epochs: id, start_block, end_block, total_rewards_kite, status
⦁	spending_windows: id, agent_did, window_start, window_end, total_spent_usdc, cap_usdc
⦁	alerts: id, type, severity, message, resolved_at, created_at

5.4  Event Flow
1.	Goldsky webhook fires on Kite L1 event → BE-08 Alerts Module receives
2.	BE-08 writes to PostgreSQL alerts table + publishes to Redis Stream
3.	Relevant agent runtime consumes from Redis Stream
4.	Agent processes event, writes result back to Redis Stream
5.	BE-09 WebSocket Gateway picks up from Redis Stream, pushes to all connected frontend clients
6.	Frontend updates dashboard in real-time

  06  Frontend Layer  
6.1  Technology Stack
⦁	Framework: Next.js 14 (App Router, React Server Components)
⦁	Wallet: wagmi v2 + RainbowKit (Kite L1 custom chain config)
⦁	Styling: Tailwind CSS + shadcn/ui component library
⦁	Real-time: native WebSocket client connecting to backend BE-09
⦁	Charts: Recharts (yield APY history, portfolio value over time)
⦁	State: Zustand for global agent/position state
⦁	Kite chain config: custom wagmi chain object with Kite RPC, Chain ID 2366, explorer kitescan.ai

6.2  Pages & Views
Page	Route	Description
Dashboard	/	Overview: total portfolio value, current APY, agent statuses, recent trades, active alerts
Positions	/positions	List of all open DeFi positions across chains. Chain, protocol, amount, APY, health factor. Real-time health factor bar.
Agent Monitor	/agents	Four agent cards. Each shows: DID, vault balance, spending window used/total, last action, PoAI score.
Signal Feed	/signals	Live stream of Scout yield signals. Each shows: source→destination, APY delta, Risk decision (approved/rejected), execution status.
Session Approval	/sessions	Pending Passport spending sessions. Owner reviews budget/TTL/scope and approves with WebAuthn passkey.
Treasury	/treasury	Multisig vault balance, pending proposals, signer status, epoch reward history.
PoAI Rewards	/poai	Per-agent reward history, current epoch attribution scores, leaderboard of permissionless Scout agents.
Settings	/settings	Risk parameters: collateral floor, max single rebalance %, approved chains/protocols, daily budget cap per agent.

6.3  Frontend Modules
Module ID	Name	Responsibility
FE-01	WalletConnector	RainbowKit + wagmi integration. Kite L1 custom chain (Chain ID 2366, RPC https://rpc.gokite.ai). SIWE login flow.
FE-02	PasskeyApproval	WebAuthn API integration for passkey-based Passport session approval. Calls BE-02 Session Module on approval.
FE-03	RealTimeEngine	WebSocket client. Subscribes to BE-09. Dispatches events to Zustand store. Reconnect-on-drop logic.
FE-04	PositionTable	Multi-chain position table. Health factor color-coded (green >1.5, amber 1.15–1.5, red <1.15). Real-time updates.
FE-05	AgentStatusCard	Per-agent card: DID badge, spending ring chart (used/cap), last action timestamp, online/offline indicator.
FE-06	SignalFeed	Scrolling feed of YieldSignals. Each entry: chain badges, APY delta pill, Risk verdict badge, tx hash link.
FE-07	YieldChart	Recharts line chart: portfolio APY over time vs benchmark (Aave USDC rate). 7d / 30d / all-time toggle.
FE-08	MultisigPanel	Ash multisig pending proposals. Signer status (signed/pending). Execute button for quorum-met proposals.
FE-09	PoAILeaderboard	Table of all registered Scout agents sorted by epoch reward. DID, signals sent, acceptance rate, total KITE earned.
FE-10	AlertBanner	Top-of-page sticky banner for critical alerts: health factor breach, spending cap hit, cross-chain message failure.
FE-11	SettingsForm	Owner-configurable risk parameters. Changes submitted as multisig proposal (large changes) or direct vault tx (small).

6.4  Kite Chain Configuration (wagmi)
import { defineChain } from 'viem'
export const kiteMainnet = defineChain({
  id: 2366,
  name: 'Kite AI',
  nativeCurrency: { name: 'KITE', symbol: 'KITE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.gokite.ai'] } },
  blockExplorers: { default: { name: 'KiteScan', url: 'https://kitescan.ai' } }
})

Reference Documentation:
⦁	Kite Network Information (Chain ID, RPC, Explorer): https://docs.gokite.ai/kite-chain/1-getting-started/network-information
⦁	Kite Tools & Explorer: https://docs.gokite.ai/kite-chain/1-getting-started/tools
⦁	wagmi v2 Custom Chain Configuration: https://wagmi.sh/core/api/createConfig
⦁	RainbowKit Custom Chain: https://www.rainbowkit.com/docs/custom-chains

  07  Infrastructure & DevOps  
7.1  Environment Configuration
Variable	Value / Source
KITE_RPC_URL	https://rpc.gokite.ai (mainnet) / https://rpc-testnet.gokite.ai (testnet)
KITE_CHAIN_ID	2366 (mainnet) / 2368 (testnet Ozone)
BUNDLER_RPC	https://bundler-service.staging.gokite.ai/rpc/
HYP_MAILBOX_KITE	0x0d5b681C5887617d68200B45F3947c99Cf402188
HYP_DOMAIN_KITE	2368
GOLDSKY_PROJECT_ID	From Goldsky dashboard
APRO_ORACLE_KITE	From APRO deployment on Kite mainnet
SETTLEMENT_TOKEN	0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A (testnet USDC)
POSTGRES_URL	postgresql://orca:pass@localhost:5432/orca
REDIS_URL	redis://localhost:6379

7.2  Docker Compose Services
⦁	orca-frontend: Next.js 14, port 3000
⦁	orca-api: Fastify, port 4000
⦁	orca-scout: Python Scout Agent
⦁	orca-risk: Python Risk Agent
⦁	orca-executor: Python Executor Agent
⦁	orca-audit: Python Audit Agent
⦁	postgres: PostgreSQL 16, port 5432
⦁	redis: Redis 7, port 6379
⦁	goldsky-listener: Goldsky webhook receiver sidecar

7.3  Deployment Order (Testnet → Mainnet)
1.	Deploy Kite testnet smart contracts (ORCARegistry, ClientAgentVaults x4, SpendingRuleEnforcer, PoAIAttribution, ORCAOApp, x402ChannelManager)
2.	Deploy RemoteAdapters on Arbitrum, Optimism, Base testnets
3.	Configure Hyperlane trusted sender/remote mappings on deployed contracts
4.	Register agent DIDs via Kite Passport CLI
5.	Deploy Ash multisig via wallet.ash.center, configure TimelockGuard + LZBridgeGuard
6.	Configure Goldsky subgraph with ORCA contract ABIs
7.	Start backend API + all four agent processes
8.	Start frontend — verify WebSocket real-time flow end to end
9.	Run integration test: inject mock yield signal, trace through Scout→Risk→Executor→Audit→PoAI
10.	Mainnet deployment follows same order with production secrets

7.4  Testing Strategy
Test Type	Tooling	Coverage
Unit tests	Hardhat + chai (contracts), pytest (agents), Jest (API)	All contract functions, agent decision logic, API endpoints
Integration tests	Hardhat fork of Kite testnet	Full flow: Scout signal → Risk approval → Executor tx → PoAI record
Cross-chain tests	Hyperlane mailbox mocks + local forks	Dispatch/handle flow, RemoteAdapter execution, bridge guard
End-to-end tests	Playwright (frontend)	Owner login → session approval → signal feed → trade execution
Load tests	k6	WebSocket concurrency, agent event throughput, API latency

  08  Implementation Sequence (Build Order)  
Phase 1 — Foundation (Days 1–2)
1.	Scaffold monorepo: /contracts, /agents, /api, /frontend
2.	Deploy ORCARegistry + 4x ClientAgentVaults on Kite testnet using gokite-aa-sdk
3.	Register 4 Agent Passports via kpass CLI
4.	Configure SpendingRuleEnforcer with test limits
5.	Stand up PostgreSQL + Redis locally via docker-compose
6.	Implement BE-01 Auth Module (SIWE) + BE-09 WebSocket Gateway skeleton

Phase 2 — Agent Core (Days 3–4)
1.	Implement Scout Agent: SC-01 YieldScanner (hybrid data layer) + SC-02 BridgeCostEstimator + SC-04 SignalBroadcaster
2.	Implement Risk Agent: RK-02 CollateralMonitor (APRO) + RK-04 SpendingRuleChecker + RK-05 RebalanceSimulator
3.	Open x402 payment channels between Scout↔Risk and Risk↔Executor
4.	Wire Redis Streams for inter-agent communication
5.	Test Scout→Risk signal flow on testnet

Phase 3 — Execution & Cross-Chain (Days 5–6)
1.	Deploy ORCAOApp on Kite testnet + RemoteAdapter on Arbitrum testnet
2.	Configure Hyperlane trusted sender/remote mapping between Kite ↔ destination chain
3.	Implement Executor Agent: EX-02 UserOpBuilder + EX-04 CrossChainExecutor
4.	Test full local-chain rebalance (same chain)
5.	Test cross-chain rebalance (Kite → Arbitrum via LZ)
6.	Implement Audit Agent + PoAIAttribution.sol integration

Phase 4 — Governance & Treasury (Day 7)
1.	Deploy Ash multisig on Kite testnet
2.	Attach TimelockGuard + LZBridgeGuard modules
3.	Wire epoch end → distributeEpochRewards() as multisig proposal
4.	Implement BE-06 Treasury Module + BE-07 PoAI Module

Phase 5 — Frontend & Integration (Days 8–9)
1.	Build FE-01 WalletConnector with Kite L1 custom chain
2.	Build FE-02 PasskeyApproval (WebAuthn)
3.	Build FE-03 RealTimeEngine (WebSocket)
4.	Build FE-04 PositionTable + FE-06 SignalFeed + FE-07 YieldChart
5.	Build FE-05 AgentStatusCard + FE-08 MultisigPanel + FE-09 PoAILeaderboard
6.	End-to-end Playwright test: full signal-to-trade flow

Phase 6 — Goldsky, Alerts & Polish (Day 10)
1.	Deploy Goldsky subgraph + configure webhooks to BE-08
2.	Implement FE-10 AlertBanner + alert routing to Slack
3.	Complete FE-11 SettingsForm with multisig proposal submission
4.	Load test WebSocket gateway + agent throughput
5.	Security audit: reentrancy checks, spending rule bypass tests, LZ trusted peer validation
6.	Mainnet deployment

  09  Complete Module Registry  
ID	Module Name	Layer	Kite Feature	Status
KM-01	Kite Passport SDK	Identity	Agent Passport / DID	Required
KM-02	gokite-aa-sdk / ClientAgentVault	Smart Contract	Account Abstraction ERC-4337	Required
KM-03	x402 State Channels	Payments	x402 / AP2 Micropayments	Required
KM-04	Ash Multisig (Safe fork)	Governance	Ash Wallet on Kite L1	Required
KM-05	Hyperlane Mailbox + Warp Route	Cross-chain	Hyperlane, Domain IDs	Required
KM-06	PoAI Attribution Hooks	Incentives	Proof of Attributed Intelligence	Required
KM-07	Goldsky Subgraph + Webhooks	Indexing	Goldsky-Kite Integration	Required
KM-08	Hybrid Market Data Layer	Data	DefiLlama + protocol enrichers	Required
SC-01	YieldScanner	Scout Agent	DefiLlama + enrichers	Required
SC-02	BridgeCostEstimator	Scout Agent	Bridge quote API (Hyperlane-compatible)	Required
SC-03	OpportunityRanker	Scout Agent	Python / LangChain	Required
SC-04	SignalBroadcaster	Scout Agent	x402 micropayment	Required
SC-05	PassportSigner	Scout Agent	Kite Passport DID key	Required
SC-06	Scout PoAI Reporter	Scout Agent	PoAI registry	Required
RK-01	SignalValidator	Risk Agent	EIP-712, Passport DID	Required
RK-02	CollateralMonitor	Risk Agent	APRO Oracle on Kite	Required
RK-03	LiquidationDefender	Risk Agent	APRO + SpendingRules	Required
RK-04	SpendingRuleChecker	Risk Agent	SpendingRuleEnforcer.sol	Required
RK-05	RebalanceSimulator	Risk Agent	Python / LangChain	Required
RK-06	InstructionSigner	Risk Agent	Passport DID, x402	Required
RK-07	Risk PoAI Reporter	Risk Agent	PoAI registry	Required
EX-01	InstructionVerifier	Executor Agent	EIP-712, Passport DID	Required
EX-02	UserOpBuilder	Executor Agent	gokite-aa-sdk batch ops	Required
EX-03	LocalChainExecutor	Executor Agent	AA SDK, Kite L1	Required
EX-04	CrossChainExecutor	Executor Agent	ORCAOApp + Hyperlane	Required
EX-05	SessionManager	Executor Agent	Kite Passport sessions	Required
EX-06	SlippageGuard	Executor Agent	AA SDK post-op check	Required
AU-01	EventSubscriber	Audit Agent	Redis Streams	Required
AU-02	AttributionRecordBuilder	Audit Agent	PoAI schema	Required
AU-03	PoAIWriter	Audit Agent	PoAIAttribution.sol	Required
AU-04	EpochManager	Audit Agent	PoAI + Multisig proposal	Required
AU-05	ComplianceLogger	Audit Agent	PostgreSQL	Required
BE-01	Auth Module	Backend API	SIWE + JWT	Required
BE-02	Session Module	Backend API	Kite Passport sessions	Required
BE-03	Position Module	Backend API	Goldsky + APRO	Required
BE-04	Agent Module	Backend API	Kite L1 reads	Required
BE-05	Signal Module	Backend API	PostgreSQL	Required
BE-06	Treasury Module	Backend API	Ash multisig reads	Required
BE-07	PoAI Module	Backend API	PoAIAttribution reads	Required
BE-08	Alerts Module	Backend API	Goldsky webhooks	Required
BE-09	WebSocket Gateway	Backend API	Redis Streams → WS	Required
FE-01	WalletConnector	Frontend	Kite L1 wagmi chain	Required
FE-02	PasskeyApproval	Frontend	WebAuthn, Kite Passport	Required
FE-03	RealTimeEngine	Frontend	WebSocket client	Required
FE-04	PositionTable	Frontend	BE-03 + WS	Required
FE-05	AgentStatusCard	Frontend	BE-04 + WS	Required
FE-06	SignalFeed	Frontend	BE-05 + WS	Required
FE-07	YieldChart	Frontend	BE-03, Recharts	Required
FE-08	MultisigPanel	Frontend	BE-06 + Ash SDK	Required
FE-09	PoAILeaderboard	Frontend	BE-07	Required
FE-10	AlertBanner	Frontend	BE-08 + WS	Required
FE-11	SettingsForm	Frontend	BE-02 + multisig	Required

  10  Reference Documentation Master List  
10.1  Kite AI Official Documentation
⦁	Kite Docs Home: https://docs.gokite.ai/
⦁	Introduction & Mission: https://docs.gokite.ai/get-started-why-kite/introduction-and-mission
⦁	Key Use Cases & Players: https://docs.gokite.ai/get-started-why-kite/key-use-cases-and-players
⦁	Architecture & Design Pillars: https://docs.gokite.ai/get-started-why-kite/architecture-and-design-pillars
⦁	Core Concepts & Terminology: https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology
⦁	Tokenomics (PoAI, KITE token): https://docs.gokite.ai/get-started-why-kite/tokenomics
⦁	Kite Whitepaper: https://gokite.ai/kite-whitepaper
⦁	MiCA Whitepaper: https://docs.gokite.ai/kite-chain/mica-whitepaper

10.2  Kite Agent Passport
⦁	Agent Passport Introduction: https://docs.gokite.ai/kite-agent-passport/kite-agent-passport
⦁	Developer Guide: https://docs.gokite.ai/kite-agent-passport/developer-guide
⦁	End User Guide: https://docs.gokite.ai/kite-agent-passport/end-user-guide
⦁	Service Provider Guide: https://docs.gokite.ai/kite-agent-passport/service-provider-guide
⦁	CLI Reference (kpass, ksearch): https://docs.gokite.ai/kite-agent-passport/cli-reference
⦁	Funding Your Passport Wallet: https://docs.gokite.ai/kite-agent-passport/funding
⦁	Testnet Notice: https://docs.gokite.ai/kite-agent-passport/testnet-notice

10.3  Kite Chain — Getting Started
⦁	Network Information (Chain ID 2366, RPC, Explorer): https://docs.gokite.ai/kite-chain/1-getting-started/network-information
⦁	Tools & Explorer (KiteScan): https://docs.gokite.ai/kite-chain/1-getting-started/tools
⦁	Kite Faucet (Testnet): ⦁	https://faucet.gokite.ai
⦁	KiteScan Explorer: ⦁	https://kitescan.ai
⦁	KiteScan Testnet Explorer: ⦁	https://testnet.kitescan.ai

10.4  Kite Chain — Smart Contracts & Development
⦁	Smart Contracts List: https://docs.gokite.ai/kite-chain/3-developing/smart-contracts-list
⦁	Building dApps on Kite: https://docs.gokite.ai/kite-chain/4-building-dapps
⦁	Account Abstraction SDK: https://docs.gokite.ai/kite-chain/account-abstraction-sdk
⦁	gokite-aa-sdk on NPM: https://www.npmjs.com/package/gokite-aa-sdk
⦁	Multisig Wallet (Ash / Safe fork): https://docs.gokite.ai/kite-chain/multisig-wallet
⦁	Security Reference: https://docs.gokite.ai/kite-chain/6-reference
⦁	Kite Stablecoin / Gasless Transfer: https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer
⦁	Kite Gasless Integration: https://docs.gokite.ai/kite-chain/9-gasless-integration

10.5  Hyperlane
⦁	Hyperlane Protocol Overview: https://docs.hyperlane.xyz/docs/protocol/protocol-overview
⦁	Hyperlane Warp Routes: https://docs.hyperlane.xyz/docs/protocol/warp-routes/warp-routes-overview
⦁	Hyperlane Agents (Validator/Relayer): https://docs.hyperlane.xyz/docs/protocol/agents/overview
⦁	Hyperlane CLI: https://docs.hyperlane.xyz/docs/reference/developer-tools/cli

10.6  Data & Indexing
⦁	Goldsky-Kite AI Integration: https://docs.gokite.ai/kite-chain/11-goldsky-kite-integration
⦁	Goldsky Documentation: ⦁	https://docs.goldsky.com
⦁	DefiLlama API Docs: https://api-docs.defillama.com/

10.7  Kite Node
⦁	Kite Node Overview: https://docs.gokite.ai/kite-chain/7-kite-node

10.8  External Protocol References
⦁	ERC-4337 Account Abstraction EIP: https://eips.ethereum.org/EIPS/eip-4337
⦁	Aave v3 Developer Docs: https://docs.aave.com/developers/
⦁	Compound v3 (Comet) Docs: https://docs.compound.finance/
⦁	Morpho Protocol Docs: https://docs.morpho.org/
⦁	Uniswap v3 Developer Docs: https://docs.uniswap.org/contracts/v3/overview
⦁	wagmi v2 Documentation: https://wagmi.sh/
⦁	RainbowKit Custom Chains: https://www.rainbowkit.com/docs/custom-chains
⦁	LangChain Python: https://python.langchain.com/docs/introduction/
⦁	web3.py Documentation: https://web3py.readthedocs.io/
⦁	Fastify Documentation: https://fastify.dev/docs/latest/
⦁	Prisma ORM: https://www.prisma.io/docs
⦁	BullMQ Job Queue: https://docs.bullmq.io/
⦁	Hardhat: https://hardhat.org/docs
⦁	Ash Wallet on Kite: https://wallet.ash.center/?network=kite
⦁	Safe Core SDK (upstream): https://github.com/safe-global/safe-core-sdk
⦁	Safe Smart Account Audit (v1.3.0): https://github.com/safe-global/safe-smart-account/blob/v1.3.0-libs.0/docs/audit_1_3_0.md
⦁	Sign-In With Ethereum (SIWE): https://docs.login.xyz/
⦁	WebAuthn / Passkey Spec: https://www.w3.org/TR/webauthn-2/
⦁	Recharts: https://recharts.org/en-US/api
⦁	Goldsky Subgraph Webhooks: https://docs.goldsky.com/subgraphs/webhooks

10.9  Testnet Addresses (Kite Testnet Ozone)
Contract / Service	Address / URL
Kite Testnet Chain ID	2368
Kite Testnet RPC	https://rpc-testnet.gokite.ai
Kite Testnet Explorer	https://testnet.kitescan.ai
Kite Testnet Faucet	https://faucet.gokite.ai
Settlement Token (USDC testnet)	0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A
Settlement Contract	0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3
ClientAgentVault Implementation	0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23
Bundler RPC	https://bundler-service.staging.gokite.ai/rpc/
Kite Mainnet Chain ID	2366
Kite Mainnet RPC	https://rpc.gokite.ai
Hyperlane Mailbox (Kite Testnet)	0x0d5b681C5887617d68200B45F3947c99Cf402188
Hyperlane Mailbox (Base Sepolia)	0x68e89453029DC14351bF72104dC30248BB766b69
Hyperlane Domain (Kite Testnet)	2368
Hyperlane Domain (Base Sepolia)	84532
