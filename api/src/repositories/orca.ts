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
} from "@orca/shared";
import { prisma } from "../db/prisma.js";
import { mockTreasury } from "../lib/mock-store.js";
import {
  toAgentRecord,
  toAlertRecord,
  toExecutionRecord,
  toPoaiRewardRecord,
  toPositionRecord,
  toScoutMarketplaceRecord,
  toScoutPayoutRecord,
  toSessionRecord,
  toSignalRecord,
  toTreasuryOverview,
} from "./serializers.js";

export async function listAgents(): Promise<AgentRecord[]> {
  const rows = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) throw new Error("No agents found in database (strict mode).");
  return rows.map(toAgentRecord);
}

export async function listPositions(): Promise<PositionRecord[]> {
  const rows = await prisma.position.findMany({
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) throw new Error("No positions found in database (strict mode).");
  return rows.map(toPositionRecord);
}

export async function listSignals(): Promise<SignalRecord[]> {
  const rows = await prisma.signal.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) throw new Error("No signals found in database (strict mode).");
  return rows.map(toSignalRecord);
}

export async function getSignalById(id: string): Promise<SignalRecord | null> {
  const row = await prisma.signal.findUnique({ where: { id } });
  if (!row) return null;

  return toSignalRecord(row);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const rows = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) throw new Error("No sessions found in database (strict mode).");
  return rows.map(toSessionRecord);
}

export async function approveSession(sessionId: string): Promise<SessionRecord | null> {
  const row = await prisma.session.findFirst({
    where: {
      OR: [{ id: sessionId }, { externalSessionId: sessionId }],
    },
  });

  if (!row) return null;

  const updated = await prisma.session.update({
    where: { id: row.id },
    data: { status: "active" },
  });

  return toSessionRecord(updated);
}

export async function expireSession(sessionId: string): Promise<SessionRecord | null> {
  const row = await prisma.session.findFirst({
    where: {
      OR: [{ id: sessionId }, { externalSessionId: sessionId }],
    },
  });

  if (!row) return null;

  const updated = await prisma.session.update({
    where: { id: row.id },
    data: { status: "expired" },
  });

  return toSessionRecord(updated);
}

export async function listAlerts(): Promise<AlertRecord[]> {
  const rows = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  if (rows.length === 0) throw new Error("No alerts found in database (strict mode).");
  return rows.map(toAlertRecord);
}

export async function createAlert(payload: {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
}): Promise<AlertRecord> {
  const row = await prisma.alert.create({
    data: {
      type: payload.type,
      severity: payload.severity,
      message: payload.message,
    },
  });

  return toAlertRecord(row);
}

export async function listPoaiRewardsByEpoch(epochId: number): Promise<PoAIRewardRecord[]> {
  const rows = await prisma.attributionRecord.findMany({
    where: { epochId },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) throw new Error(`No PoAI rewards found for epoch ${epochId} (strict mode).`);
  return rows.map(toPoaiRewardRecord);
}

export async function listPoaiRewardsByDid(did: string): Promise<PoAIRewardRecord[]> {
  const rows = await prisma.attributionRecord.findMany({
    where: { agentDid: did },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) throw new Error(`No PoAI rewards found for DID ${did} (strict mode).`);
  return rows.map(toPoaiRewardRecord);
}

export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  const positions = await prisma.position.findMany();

  if (positions.length === 0) throw new Error("No treasury positions found in database (strict mode).");

  const balanceUsdc = positions.reduce((acc: number, position) => acc + Number(position.amountUsdc), 0);

  return toTreasuryOverview(balanceUsdc, 0, mockTreasury.signers, mockTreasury.threshold);
}

export async function listExecutions(): Promise<ExecutionRecord[]> {
  const rows = await prisma.execution.findMany({ orderBy: { createdAt: "desc" } });
  if (rows.length === 0) throw new Error("No executions found in database (strict mode).");
  return rows.map(toExecutionRecord);
}

export async function getExecutionById(id: string): Promise<ExecutionRecord | null> {
  const row = await prisma.execution.findUnique({ where: { id } });
  if (!row) return null;
  return toExecutionRecord(row);
}

export async function createExecutionRecord(payload: {
  signalId: string;
  instructionId?: string;
  executorDid: string;
  txHash: string;
  status: string;
  lzMessageId?: string;
  slippageBps?: number;
}): Promise<ExecutionRecord> {
  const row = await prisma.execution.create({
    data: {
      signalId: payload.signalId,
      instructionId: payload.instructionId,
      executorDid: payload.executorDid,
      txHash: payload.txHash,
      status: payload.status,
      lzMessageId: payload.lzMessageId,
      slippageBps: payload.slippageBps,
    },
  });
  return toExecutionRecord(row);
}

export async function listScouts(): Promise<ScoutMarketplaceRecord[]> {
  const rows = await prisma.scoutMarketplace.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toScoutMarketplaceRecord);
}

export async function listScoutPayouts(did?: string): Promise<ScoutPayoutRecord[]> {
  const rows = await prisma.scoutPayout.findMany({
    where: did ? { scoutDid: did } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toScoutPayoutRecord);
}
