import type {
  AgentRecord,
  AlertRecord,
  PoAIRewardRecord,
  PositionRecord,
  SessionRecord,
  SignalRecord,
  TreasuryOverview,
} from "./domain.js";

export interface ApiHealthResponse {
  status: "ok";
  service: "orca-api";
  timestamp: string;
}

export interface AuthNonceResponse {
  address: string;
  nonce: string;
  message: string;
}

export interface AuthVerifyResponse {
  token: string;
  expiresAt: string;
}

export interface PositionsResponse {
  positions: PositionRecord[];
}

export interface PositionHistoryResponse {
  positionId: string;
  history: PositionRecord[];
}

export interface AgentsResponse {
  agents: AgentRecord[];
}

export interface AgentActionsResponse {
  did: string;
  actions: Array<{ id: string; action: string; at: string; txHash?: string }>;
}

export interface SignalsResponse {
  signals: SignalRecord[];
}

export interface SessionsResponse {
  sessions: SessionRecord[];
}

export interface TreasuryResponse {
  treasury: TreasuryOverview;
}

export interface TreasuryPendingResponse {
  pending: Array<{ id: string; to: string; valueUsdc: number; approvals: number; required: number }>;
}

export interface PoAIEpochRewardsResponse {
  epochId: number;
  rewards: PoAIRewardRecord[];
}

export interface PoAIAgentHistoryResponse {
  did: string;
  rewards: PoAIRewardRecord[];
}

export interface AlertsResponse {
  alerts: AlertRecord[];
}
