import type {
  AgentRecord,
  AlertRecord,
  ExecutionRecord,
  PoAIRewardRecord,
  PositionRecord,
  ScoutMarketplaceRecord,
  ScoutPayoutRecord,
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

export interface SignalResponse {
  signal: SignalRecord;
}

export interface ExecutionsResponse {
  executions: ExecutionRecord[];
}

export interface ExecutionResponse {
  execution: ExecutionRecord;
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

export interface ScoutsResponse {
  scouts: ScoutMarketplaceRecord[];
}

export interface ScoutPayoutsResponse {
  payouts: ScoutPayoutRecord[];
}

export interface ScoutRegistrationChallengeResponse {
  nonce: string;
  deadline: number;
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  registryAddress: string;
  stakeTokenAddress: string;
  stakeDecimals: number;
  didHashHex?: string;
}

export interface ScoutRegistrationAttestRequest {
  domainName?: string;
  chainId?: number;
  registryAddress: string;
  stakeDecimals?: number;
  did: string;
  vault: string;
  bondAmountWei: string;
  ownerAddress: string;
  nonce: string;
  deadline: string;
  signature: string;
  messageDidHash: string;
}

export interface ScoutRegistrationAttestResponse {
  marketplaceId: string;
  did: string;
  didHashHex: string;
  vaultAddress: string;
  bondAmountWei: string;
  chainId: number;
}

export interface ScoutRegistrationTxDataResponse {
  to: string;
  data: string;
  marketplaceId: string;
}

export interface ScoutRegistrationConfirmResponse {
  scout: ScoutMarketplaceRecord;
}
