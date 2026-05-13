import type {
  AgentRecord,
  AlertRecord,
  PoAIRewardRecord,
  PositionRecord,
  SessionRecord,
  SignalRecord,
  TreasuryOverview,
} from "@orca/shared";
import type { Agent, Alert, AttributionRecord, Position, Session, Signal } from "@prisma/client";

const decimalToNumber = (value: { toString(): string } | number | string): number => Number(value.toString());

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

export function toPositionRecord(position: Position): PositionRecord {
  return {
    id: position.id,
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
    createdAt: signal.createdAt.toISOString(),
  };
}

export function toSessionRecord(session: Session): SessionRecord {
  return {
    id: session.externalSessionId ?? session.id,
    agentDid: session.agentDid,
    maxAmountPerTxUsdc: decimalToNumber(session.maxAmountPerTxUsdc),
    maxTotalAmountUsdc: decimalToNumber(session.maxTotalAmountUsdc),
    usedAmountUsdc: decimalToNumber(session.usedAmountUsdc),
    ttlSeconds: session.ttlSeconds,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
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

export function toPoaiRewardRecord(record: AttributionRecord): PoAIRewardRecord {
  return {
    epochId: record.epochId,
    agentDid: record.agentDid,
    amountKite: decimalToNumber(record.valueDelta),
    createdAt: record.createdAt.toISOString(),
  };
}

export function toTreasuryOverview(
  balanceUsdc: number,
  pendingCount: number,
  signers: string[],
  threshold = "3/5"
): TreasuryOverview {
  return {
    balanceUsdc,
    pendingMultisigTxCount: pendingCount,
    signers,
    threshold,
  };
}
