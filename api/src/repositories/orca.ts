import { getAddress } from "ethers";
import { Prisma } from "@prisma/client";
import type {
  AgentRecord,
  AlertRecord,
  ExecutionRecord,
  PoAIRewardRecord,
  PositionRecord,
  DepositRecord,
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
  toDepositRecord,
  toExecutionRecord,
  toPoaiRewardRecord,
  toPositionRecord,
  toScoutMarketplaceRecord,
  toScoutPayoutRecord,
  toSessionRecord,
  toSignalRecord,
  toTreasuryOverview,
} from "./serializers.js";

const positionSelect = {
  id: true,
  userId: true,
  chainId: true,
  chainName: true,
  protocol: true,
  asset: true,
  amountUsdc: true,
  apy: true,
  healthFactor: true,
  lastUpdated: true,
} satisfies Prisma.PositionSelect;

const legacyPositionSelect = {
  id: true,
  chainId: true,
  chainName: true,
  protocol: true,
  asset: true,
  amountUsdc: true,
  apy: true,
  healthFactor: true,
  lastUpdated: true,
} satisfies Prisma.PositionSelect;

function isMissingColumnError(error: unknown, column: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.meta?.column ?? "").includes(column)
  );
}

export async function listAgents(): Promise<AgentRecord[]> {
  const rows = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
  });

  return rows.map(toAgentRecord);
}

export async function listPositionsForWallet(wallet: string): Promise<PositionRecord[]> {
  const w = getAddress(wallet);
  try {
    const rows = await prisma.position.findMany({
      where: { user: { walletAddress: w } },
      select: positionSelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toPositionRecord);
  } catch (error) {
    if (!isMissingColumnError(error, "Position.userId")) {
      throw error;
    }
    const rows = await prisma.position.findMany({
      select: legacyPositionSelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toPositionRecord);
  }
}

export async function listDepositsForWallet(wallet: string): Promise<DepositRecord[]> {
  const w = getAddress(wallet);
  const rows = await prisma.deposit.findMany({
    where: { user: { walletAddress: w } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDepositRecord);
}

export async function listPositions(): Promise<PositionRecord[]> {
  try {
    const rows = await prisma.position.findMany({
      select: positionSelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toPositionRecord);
  } catch (error) {
    if (!isMissingColumnError(error, "Position.userId")) {
      throw error;
    }
    const rows = await prisma.position.findMany({
      select: legacyPositionSelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toPositionRecord);
  }
}

export async function listSignals(): Promise<SignalRecord[]> {
  const rows = await prisma.signal.findMany({
    orderBy: { createdAt: "desc" },
  });

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

  return rows.map(toPoaiRewardRecord);
}

export async function listPoaiRewardsByDid(did: string): Promise<PoAIRewardRecord[]> {
  const rows = await prisma.attributionRecord.findMany({
    where: { agentDid: did },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toPoaiRewardRecord);
}

export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  const positions = await prisma.position.findMany({
    select: { amountUsdc: true },
  });

  const balanceUsdc = positions.reduce((acc: number, position) => acc + Number(position.amountUsdc), 0);

  return toTreasuryOverview(balanceUsdc, 0, mockTreasury.signers, mockTreasury.threshold);
}

export async function listExecutions(): Promise<ExecutionRecord[]> {
  const rows = await prisma.execution.findMany({ orderBy: { createdAt: "desc" } });
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
