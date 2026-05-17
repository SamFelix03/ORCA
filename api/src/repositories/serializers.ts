import type {
  AgentRecord,
  AlertRecord,
  DepositRecord,
  ExecutionRecord,
  PositionRecord,
  ScoutMarketplaceRecord,
  ScoutPayoutRecord,
  SignalRecord,
  TreasuryOverview,
  RelayerMessageRecord,
  RiskInstructionRecord,
  VaultHoldingRecord,
  WorkflowEventRecord,
  X402PaymentRecord,
} from "@orca/shared";
import type {
  Agent,
  Alert,
  Deposit,
  Execution,
  Position,
  RelayerMessage,
  RiskInstruction,
  ScoutMarketplace,
  ScoutPayout,
  Signal,
  VaultHolding,
  WorkflowEvent,
  X402Payment,
} from "@prisma/client";

const decimalToNumber = (value: { toString(): string } | number | string): number => Number(value.toString());

type PositionLike = Pick<
  Position,
  "id" | "chainId" | "chainName" | "protocol" | "asset" | "amountUsdc" | "apy" | "healthFactor" | "lastUpdated"
> & {
  userId?: string | null;
};

export function toAgentRecord(agent: Agent): AgentRecord {
  return {
    did: agent.did,
    type: agent.type,
    vaultAddress: agent.vaultAddress,
    sessionId: agent.passportSessionId,
    online: agent.online,
    lastActionAt: (agent.lastActionAt ?? agent.updatedAt).toISOString(),
    spendingUsedUsdc: decimalToNumber(agent.spendingUsedUsdc),
    spendingCapUsdc: decimalToNumber(agent.spendingCapUsdc),
    poaiScore: decimalToNumber(agent.poaiScore),
  };
}

export function toPositionRecord(position: PositionLike): PositionRecord {
  return {
    id: position.id,
    userId: position.userId ?? null,
    chainId: position.chainId,
    chainName: position.chainName,
    protocol: position.protocol,
    asset: position.asset,
    amountUsdc: decimalToNumber(position.amountUsdc),
    apy: decimalToNumber(position.apy),
    healthFactor: decimalToNumber(position.healthFactor),
    lastUpdated: position.lastUpdated.toISOString(),
  };
}

export function toDepositRecord(row: Deposit): DepositRecord {
  return {
    id: row.id,
    chainId: row.chainId,
    txHash: row.txHash,
    token: row.token,
    amountUsdc: decimalToNumber(row.amountUsdc),
    destination: row.destination,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSignalRecord(signal: Signal): SignalRecord {
  return {
    id: signal.id,
    scoutDid: signal.scoutDid,
    srcChain: signal.srcChain,
    dstChain: signal.dstChain,
    srcProtocol: signal.srcProtocol,
    dstProtocol: signal.dstProtocol,
    netDeltaApy: decimalToNumber(signal.netDeltaApy),
    suggestedAmountUsdc: decimalToNumber(signal.suggestedAmountUsdc),
    status: signal.status,
    riskDecisionReason: signal.riskDecisionReason ?? undefined,
    txHash: signal.txHash ?? undefined,
    paymentTxHash: undefined,
    executionId: undefined,
    createdAt: signal.createdAt.toISOString(),
  };
}

export function toExecutionRecord(execution: Execution): ExecutionRecord {
  return {
    id: execution.id,
    signalId: execution.signalId,
    instructionId: execution.instructionId ?? undefined,
    executorDid: execution.executorDid,
    txHash: execution.txHash,
    lzMessageId: execution.lzMessageId ?? undefined,
    status: execution.status,
    slippageBps: execution.slippageBps ?? undefined,
    createdAt: execution.createdAt.toISOString(),
  };
}

export function toRiskInstructionRecord(row: RiskInstruction): RiskInstructionRecord {
  return {
    id: row.id,
    signalId: row.signalId,
    riskDid: row.riskDid,
    executorDid: row.executorDid,
    approved: row.approved,
    reason: row.reason,
    sourceSignalHash: row.sourceSignalHash,
    paymentTxHash: row.paymentTxHash,
    signature: row.signature,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWorkflowEventRecord(row: WorkflowEvent): WorkflowEventRecord {
  const chainRaw = row.chainOfThought;
  const chainOfThought = Array.isArray(chainRaw)
    ? chainRaw.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    id: row.id,
    signalId: row.signalId,
    eventType: row.eventType,
    agentDid: row.agentDid,
    agentType: row.agentType,
    title: row.title,
    summary: row.summary,
    txHash: row.txHash,
    paymentTxHash: row.paymentTxHash,
    chainId: row.chainId,
    chainOfThought,
    verdict: row.verdict ?? undefined,
    verdictSummary: row.verdictSummary ?? undefined,
    llmModel: row.llmModel ?? undefined,
    payload: row.payload,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export function toX402PaymentRecord(row: X402Payment): X402PaymentRecord {
  return {
    id: row.id,
    signalId: row.signalId,
    instructionId: row.instructionId,
    fromDid: row.fromDid,
    toDid: row.toDid,
    amountWei: row.amountWei,
    asset: row.asset,
    network: row.network,
    memo: row.memo,
    txHash: row.txHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRelayerMessageRecord(row: RelayerMessage): RelayerMessageRecord {
  return {
    id: row.id,
    signalId: row.signalId,
    messageId: row.messageId,
    originDomain: row.originDomain,
    destinationDomain: row.destinationDomain,
    recipient: row.recipient,
    dispatchTxHash: row.dispatchTxHash,
    deliveryTxHash: row.deliveryTxHash,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toVaultHoldingRecord(row: VaultHolding): VaultHoldingRecord {
  return {
    id: row.id,
    ownerWallet: row.ownerWallet,
    vaultAddress: row.vaultAddress,
    chainId: row.chainId,
    chainName: row.chainName,
    protocol: row.protocol,
    token: row.token,
    balanceRaw: row.balanceRaw,
    decimals: row.decimals,
    amountUsdc: decimalToNumber(row.amountUsdc),
    sourceTxHash: row.sourceTxHash,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAlertRecord(alert: Alert): AlertRecord {
  return {
    id: alert.id,
    type: alert.type as AlertRecord["type"],
    severity: alert.severity,
    message: alert.message,
    createdAt: alert.createdAt.toISOString(),
    resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
  };
}

export function toScoutMarketplaceRecord(row: ScoutMarketplace): ScoutMarketplaceRecord {
  const bondWei =
    row.bondAmountWei && row.bondAmountWei !== "0" ? row.bondAmountWei : undefined;
  const vault = row.vaultAddress?.trim();
  const didHash = row.didHashHex?.trim();

  return {
    id: row.id,
    did: row.did,
    didHashHex: didHash || undefined,
    ownerAddress: row.ownerAddress,
    vaultAddress: vault || undefined,
    bondAmountWei: bondWei,
    chainId: row.chainId,
    registrationTxHash: row.registrationTxHash ?? undefined,
    status: row.status as ScoutMarketplaceRecord["status"],
    stakeUsdc: decimalToNumber(row.stakeUsdc),
    reputationScore: decimalToNumber(row.reputationScore),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toScoutPayoutRecord(row: ScoutPayout): ScoutPayoutRecord {
  return {
    id: row.id,
    scoutDid: row.scoutDid,
    epochId: row.epochId,
    amountUsdc: decimalToNumber(row.amountUsdc),
    status: row.status as ScoutPayoutRecord["status"],
    txHash: row.txHash ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTreasuryOverview(snapshot: TreasuryOverview): TreasuryOverview {
  return snapshot;
}
