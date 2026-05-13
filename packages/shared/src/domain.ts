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
  poaiScore: number;
}

export interface PositionRecord {
  id: string;
  chainId: number;
  chainName: string;
  protocol: string;
  asset: string;
  amountUsdc: number;
  apy: number;
  healthFactor: number;
  lastUpdated: string;
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
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  agentDid: string;
  maxAmountPerTxUsdc: number;
  maxTotalAmountUsdc: number;
  usedAmountUsdc: number;
  ttlSeconds: number;
  status: "pending" | "active" | "expired" | "rejected";
  createdAt: string;
}

export interface TreasuryOverview {
  balanceUsdc: number;
  pendingMultisigTxCount: number;
  threshold: string;
  signers: string[];
}

export interface PoAIRewardRecord {
  epochId: number;
  agentDid: string;
  amountKite: number;
  acceptanceRate?: number;
  signalsCount?: number;
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
