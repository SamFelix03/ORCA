export type AgentType = "scout" | "risk" | "executor" | "audit";

export type SignalStatus = "pending" | "approved" | "rejected" | "executing" | "executed" | "failed";

export interface AgentRecord {
  did: string;
  type: AgentType;
  vaultAddress: string;
  sessionId: string | null;
  online: boolean;
  lastActionAt: string;
  spendingUsedUsdc: number;
  spendingCapUsdc: number;
  x402PaymentCount?: number;
  x402PaymentAmountWei?: string;
  x402PaymentAsset?: string;
  poaiScore: number;
}

export interface PositionRecord {
  id: string;
  userId?: string | null;
  chainId: number;
  chainName: string;
  protocol: string;
  asset: string;
  amountUsdc: number;
  apy: number;
  healthFactor: number;
  lastUpdated: string;
}

export interface DepositRecord {
  id: string;
  chainId: number;
  txHash: string | null;
  token: string;
  amountUsdc: number;
  destination: string | null;
  createdAt: string;
}

export interface SignalRecord {
  id: string;
  scoutDid: string;
  srcChain: number;
  dstChain: number;
  srcProtocol: string;
  dstProtocol: string;
  netDeltaApy: number;
  suggestedAmountUsdc: number;
  status: SignalStatus;
  riskDecisionReason?: string;
  txHash?: string;
  paymentTxHash?: string;
  paymentAmountWei?: string;
  paymentCount?: number;
  paymentAsset?: string;
  executionId?: string;
  createdAt: string;
}

export interface WorkflowEventRecord {
  id: string;
  signalId?: string | null;
  eventType: string;
  agentDid?: string | null;
  agentType?: string | null;
  title: string;
  summary: string;
  txHash?: string | null;
  paymentTxHash?: string | null;
  chainId?: number | null;
  chainOfThought?: string[];
  verdict?: unknown;
  verdictSummary?: string;
  llmModel?: string;
  payload: unknown;
  occurredAt: string;
}

export interface RiskInstructionRecord {
  id: string;
  signalId: string;
  riskDid: string;
  executorDid: string;
  approved: boolean;
  reason: string;
  sourceSignalHash?: string | null;
  paymentTxHash?: string | null;
  signature?: string | null;
  payload: unknown;
  createdAt: string;
}

export interface X402PaymentRecord {
  id: string;
  signalId?: string | null;
  instructionId?: string | null;
  fromDid?: string | null;
  toDid: string;
  amountWei: string;
  asset: string;
  network: string;
  memo?: string | null;
  txHash: string;
  createdAt: string;
}

export interface RelayerMessageRecord {
  id: string;
  signalId?: string | null;
  messageId: string;
  originDomain: number;
  destinationDomain: number;
  recipient: string;
  dispatchTxHash?: string | null;
  deliveryTxHash?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultHoldingRecord {
  id: string;
  ownerWallet?: string | null;
  vaultAddress: string;
  chainId: number;
  chainName: string;
  protocol: string;
  token: string;
  balanceRaw: string;
  decimals: number;
  amountUsdc: number;
  sourceTxHash?: string | null;
  updatedAt: string;
}

export interface TokenBalanceRecord {
  symbol: string;
  address: string;
  raw: string;
  decimals: number;
  balance: number;
}

export interface ExecutionRecord {
  id: string;
  signalId: string;
  instructionId?: string;
  executorDid: string;
  txHash: string;
  lzMessageId?: string;
  status: string;
  slippageBps?: number;
  createdAt: string;
}

export interface TreasuryOverview {
  address: string | null;
  nativeBalance: number;
  tokenBalances: Array<{
    symbol: string;
    address: string;
    balance: number;
    raw: string;
    decimals: number;
  }>;
  threshold: string;
  signers: string[];
}

export interface PoAIRewardRecord {
  epochId: number;
  agentDid: string;
  agentDidHash?: string;
  actionType?: "SIGNAL" | "RISK_EVAL" | "EXECUTION" | "AUDIT";
  valueDelta: number;
  inputHash?: string;
  outcomeHash?: string;
  createdAt: string;
}

export interface AlertRecord {
  id: string;
  type: "health_factor" | "spending_cap" | "lz_failure" | "system";
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ScoutMarketplaceRecord {
  id: string;
  did: string;
  didHashHex?: string;
  ownerAddress: string;
  vaultAddress?: string;
  bondAmountWei?: string;
  chainId?: number;
  registrationTxHash?: string;
  status: "pending" | "active" | "suspended";
  stakeUsdc: number;
  reputationScore: number;
  createdAt: string;
}

export interface ScoutPayoutRecord {
  id: string;
  scoutDid: string;
  epochId: number;
  amountUsdc: number;
  status: "pending" | "settled" | "failed";
  txHash?: string;
  createdAt: string;
}
