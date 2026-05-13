import type {
  AgentActionsResponse,
  AgentRecord,
  AlertRecord,
  PoAIRewardRecord,
  PositionRecord,
  SessionRecord,
  SignalRecord,
  TreasuryOverview,
} from "@orca/shared";

const nowIso = new Date().toISOString();

export const mockAgents: AgentRecord[] = [
  {
    did: "did:kite:orca/scout-1",
    type: "scout",
    vaultAddress: "0x1111111111111111111111111111111111111111",
    sessionId: "sess-scout-1",
    online: true,
    lastActionAt: nowIso,
    spendingUsedUsdc: 22,
    spendingCapUsdc: 500,
    poaiScore: 88,
  },
  {
    did: "did:kite:orca/risk-1",
    type: "risk",
    vaultAddress: "0x2222222222222222222222222222222222222222",
    sessionId: "sess-risk-1",
    online: true,
    lastActionAt: nowIso,
    spendingUsedUsdc: 5,
    spendingCapUsdc: 100,
    poaiScore: 92,
  },
  {
    did: "did:kite:orca/executor-1",
    type: "executor",
    vaultAddress: "0x3333333333333333333333333333333333333333",
    sessionId: "sess-exec-1",
    online: true,
    lastActionAt: nowIso,
    spendingUsedUsdc: 310,
    spendingCapUsdc: 5000,
    poaiScore: 95,
  },
  {
    did: "did:kite:orca/audit-1",
    type: "audit",
    vaultAddress: "0x4444444444444444444444444444444444444444",
    sessionId: null,
    online: true,
    lastActionAt: nowIso,
    spendingUsedUsdc: 1,
    spendingCapUsdc: 50,
    poaiScore: 90,
  },
];

export const mockPositions: PositionRecord[] = [
  {
    id: "pos-1",
    chainId: 1,
    chainName: "Ethereum",
    protocol: "aave-v3",
    asset: "USDC",
    amountUsdc: 125000,
    apy: 4.2,
    healthFactor: 1.63,
    lastUpdated: nowIso,
  },
  {
    id: "pos-2",
    chainId: 42161,
    chainName: "Arbitrum",
    protocol: "morpho",
    asset: "USDC",
    amountUsdc: 95000,
    apy: 6.8,
    healthFactor: 1.44,
    lastUpdated: nowIso,
  },
];

export const mockSignals: SignalRecord[] = [
  {
    id: "sig-1",
    scoutDid: "did:kite:orca/scout-1",
    srcChain: 1,
    dstChain: 42161,
    srcProtocol: "aave-v3",
    dstProtocol: "morpho",
    netDeltaApy: 2.1,
    suggestedAmountUsdc: 20000,
    status: "approved",
    riskDecisionReason: "Healthy HF after simulation",
    txHash: "0xaaaa...bbbb",
    createdAt: nowIso,
  },
  {
    id: "sig-2",
    scoutDid: "did:kite:orca/scout-1",
    srcChain: 42161,
    dstChain: 10,
    srcProtocol: "morpho",
    dstProtocol: "compound-v3",
    netDeltaApy: 1.2,
    suggestedAmountUsdc: 8000,
    status: "pending",
    createdAt: nowIso,
  },
];

export const mockSessions: SessionRecord[] = [
  {
    id: "sess-exec-1",
    agentDid: "did:kite:orca/executor-1",
    maxAmountPerTxUsdc: 500,
    maxTotalAmountUsdc: 5000,
    usedAmountUsdc: 310,
    ttlSeconds: 86400,
    status: "active",
    createdAt: nowIso,
  },
  {
    id: "sess-scout-1",
    agentDid: "did:kite:orca/scout-1",
    maxAmountPerTxUsdc: 2,
    maxTotalAmountUsdc: 500,
    usedAmountUsdc: 22,
    ttlSeconds: 86400,
    status: "active",
    createdAt: nowIso,
  },
];

export const mockTreasury: TreasuryOverview = {
  balanceUsdc: 235000,
  pendingMultisigTxCount: 2,
  threshold: "3/5",
  signers: [
    "0x8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A8A",
    "0x9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B9B",
    "0x7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C7C",
    "0x6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D",
    "0x5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E",
  ],
};

export const mockRewards: PoAIRewardRecord[] = [
  {
    epochId: 42,
    agentDid: "did:kite:orca/scout-1",
    amountKite: 124.3,
    acceptanceRate: 0.76,
    signalsCount: 43,
    createdAt: nowIso,
  },
  {
    epochId: 42,
    agentDid: "did:kite:orca/executor-1",
    amountKite: 244.1,
    createdAt: nowIso,
  },
];

export const mockAlerts: AlertRecord[] = [
  {
    id: "al-1",
    type: "health_factor",
    severity: "warning",
    message: "Position pos-2 health factor moved to 1.44",
    createdAt: nowIso,
    resolvedAt: null,
  },
  {
    id: "al-2",
    type: "system",
    severity: "info",
    message: "Epoch 42 reward distribution proposal created",
    createdAt: nowIso,
    resolvedAt: null,
  },
];

export const mockActionsByAgent: Record<string, AgentActionsResponse["actions"]> = {
  "did:kite:orca/scout-1": [
    { id: "act-1", action: "signal.generated", at: nowIso },
    { id: "act-2", action: "x402.payment.sent", at: nowIso },
  ],
  "did:kite:orca/executor-1": [{ id: "act-3", action: "rebalance.executed", at: nowIso, txHash: "0xaaaa...bbbb" }],
};
