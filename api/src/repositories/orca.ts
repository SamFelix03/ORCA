import type {
  AgentRecord,
  AlertRecord,
  PoAIRewardRecord,
  PositionRecord,
  SessionRecord,
  SignalRecord,
  TreasuryOverview,
} from "@orca/shared";
import { prisma } from "../db/prisma.js";
import {
  mockAgents,
  mockAlerts,
  mockPositions,
  mockRewards,
  mockSessions,
  mockSignals,
  mockTreasury,
} from "../lib/mock-store.js";
import {
  toAgentRecord,
  toAlertRecord,
  toPoaiRewardRecord,
  toPositionRecord,
  toSessionRecord,
  toSignalRecord,
  toTreasuryOverview,
} from "./serializers.js";

export async function listAgents(): Promise<AgentRecord[]> {
  const rows = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) return mockAgents;
  return rows.map(toAgentRecord);
}

export async function listPositions(): Promise<PositionRecord[]> {
  const rows = await prisma.position.findMany({
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) return mockPositions;
  return rows.map(toPositionRecord);
}

export async function listSignals(): Promise<SignalRecord[]> {
  const rows = await prisma.signal.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) return mockSignals;
  return rows.map(toSignalRecord);
}

export async function getSignalById(id: string): Promise<SignalRecord | null> {
  const row = await prisma.signal.findUnique({ where: { id } });
  if (!row) {
    return mockSignals.find((signal) => signal.id === id) ?? null;
  }

  return toSignalRecord(row);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const rows = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) return mockSessions;
  return rows.map(toSessionRecord);
}

export async function approveSession(sessionId: string): Promise<SessionRecord | null> {
  const row = await prisma.session.findFirst({
    where: {
      OR: [{ id: sessionId }, { externalSessionId: sessionId }],
    },
  });

  if (!row) {
    const fallback = mockSessions.find((session) => session.id === sessionId);
    if (!fallback) return null;
    fallback.status = "active";
    return fallback;
  }

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

  if (!row) {
    const fallback = mockSessions.find((session) => session.id === sessionId);
    if (!fallback) return null;
    fallback.status = "expired";
    return fallback;
  }

  const updated = await prisma.session.update({
    where: { id: row.id },
    data: { status: "expired" },
  });

  return toSessionRecord(updated);
}

export async function listAlerts(): Promise<AlertRecord[]> {
  const rows = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  if (rows.length === 0) return mockAlerts;
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

  if (rows.length === 0) return mockRewards.filter((reward) => reward.epochId === epochId);
  return rows.map(toPoaiRewardRecord);
}

export async function listPoaiRewardsByDid(did: string): Promise<PoAIRewardRecord[]> {
  const rows = await prisma.attributionRecord.findMany({
    where: { agentDid: did },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) return mockRewards.filter((reward) => reward.agentDid === did);
  return rows.map(toPoaiRewardRecord);
}

export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  const positions = await prisma.position.findMany();

  if (positions.length === 0) return mockTreasury;

  const balanceUsdc = positions.reduce((acc: number, position) => acc + Number(position.amountUsdc), 0);

  return toTreasuryOverview(balanceUsdc, 0, mockTreasury.signers, mockTreasury.threshold);
}
