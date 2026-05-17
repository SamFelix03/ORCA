import type {
  AgentRecord,
  AlertRecord,
  ExecutionRecord,
  PoAIRewardRecord,
  PositionRecord,
  DepositRecord,
  ScoutMarketplaceRecord,
  ScoutPayoutRecord,
  SignalRecord,
  TreasuryOverview,
  TokenBalanceRecord,
  RelayerMessageRecord,
  RiskInstructionRecord,
  VaultHoldingRecord,
  WorkflowEventRecord,
  X402PaymentRecord,
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

export interface DepositsResponse {
  deposits: DepositRecord[];
}

export interface VaultHoldingsResponse {
  holdings: VaultHoldingRecord[];
}

export interface TokenBalancesResponse {
  balances: TokenBalanceRecord[];
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

export interface SignalWorkflowResponse {
  signal: SignalRecord;
  riskInstruction: RiskInstructionRecord | null;
  execution: ExecutionRecord | null;
  events: WorkflowEventRecord[];
  payments: X402PaymentRecord[];
  relayerMessages: RelayerMessageRecord[];
}

export interface ExecutionsResponse {
  executions: ExecutionRecord[];
}

export interface ExecutionResponse {
  execution: ExecutionRecord;
}

export interface TreasuryResponse {
  treasury: TreasuryOverview;
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

/** Quote for buying access to a marketplace-listed scout (direct ERC-20 transfer). */
export interface ScoutPurchaseQuoteResponse {
  token: string;
  recipient: string;
  amountWei: string;
  chainId: number;
}

export interface ScoutPurchaseConfirmRequest {
  buyerWallet: string;
  txHash: string;
}

export interface ScoutPurchaseConfirmResponse {
  purchaseId: string;
  bindingSecret: string;
}

export interface ScoutPurchaseBindingRequest {
  buyerWallet: string;
  redisUrl: string;
  scoutSignalStreamKey?: string;
  bindingSecret: string;
}

/** Response for creator-run Scout polling buyer deployment binding. */
export interface ScoutPurchaseBindingResponse {
  redisUrl: string;
  scoutSignalStreamKey: string;
}
