import { getAddress } from "ethers";
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
} from "@orca/shared";
import { prisma } from "../db/prisma.js";
import { readPoaiEpochRecords, readTreasurySnapshot } from "../adapters/kite.js";
import {
  toAgentRecord,
  toAlertRecord,
  toDepositRecord,
  toExecutionRecord,
  toRelayerMessageRecord,
  toRiskInstructionRecord,
  toScoutMarketplaceRecord,
  toScoutPayoutRecord,
  toSignalRecord,
  toTreasuryOverview,
  toVaultHoldingRecord,
  toWorkflowEventRecord,
  toX402PaymentRecord,
} from "./serializers.js";

export async function listAgents(): Promise<AgentRecord[]> {
  const [rows, latestEvents, paymentGroups] = await Promise.all([
    prisma.agent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.workflowEvent.groupBy({
      by: ["agentDid"],
      where: { agentDid: { not: null } },
      _max: { occurredAt: true },
    }),
    prisma.x402Payment.groupBy({
      by: ["fromDid"],
      where: { fromDid: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const eventsByDid = new Map(latestEvents.map((item) => [item.agentDid, item._max.occurredAt]));
  const paymentsByDid = new Map(paymentGroups.map((item) => [item.fromDid, item._count._all]));
  const known = [
    { did: "did:kite:orca/scout-1", type: "scout" as const },
    { did: "did:kite:orca/risk-1", type: "risk" as const },
    { did: "did:kite:orca/executor-1", type: "executor" as const },
    { did: "did:kite:orca/audit-1", type: "audit" as const },
  ];
  const persisted = rows.filter((row) => !/^0x(1{40}|2{40}|3{40}|4{40})$/i.test(row.vaultAddress)).map(toAgentRecord);
  const persistedDids = new Set(persisted.map((item) => item.did));
  const derived = known
    .filter((agent) => !persistedDids.has(agent.did))
    .map((agent) => {
      const lastAction = eventsByDid.get(agent.did);
      return {
        did: agent.did,
        type: agent.type,
        vaultAddress: "",
        sessionId: null,
        online: lastAction ? Date.now() - lastAction.getTime() < 5 * 60 * 1000 : false,
        lastActionAt: lastAction?.toISOString() ?? new Date(0).toISOString(),
        spendingUsedUsdc: paymentsByDid.get(agent.did) ?? 0,
        spendingCapUsdc: 0,
        poaiScore: 0,
      };
    });
  return [...persisted, ...derived];
}

export async function listPositionsForWallet(wallet: string): Promise<PositionRecord[]> {
  getAddress(wallet);
  return [];
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
  return [];
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

export async function getSignalWorkflow(signalId: string) {
  const [signal, riskInstruction, execution, events, payments, relayerMessages] = await Promise.all([
    prisma.signal.findUnique({ where: { id: signalId } }),
    prisma.riskInstruction.findUnique({ where: { signalId } }),
    prisma.execution.findUnique({ where: { signalId } }),
    prisma.workflowEvent.findMany({ where: { signalId }, orderBy: { occurredAt: "asc" } }),
    prisma.x402Payment.findMany({ where: { signalId }, orderBy: { createdAt: "asc" } }),
    prisma.relayerMessage.findMany({ where: { signalId }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!signal) return null;

  return {
    signal: toSignalRecord(signal),
    riskInstruction: riskInstruction ? toRiskInstructionRecord(riskInstruction) : null,
    execution: execution ? toExecutionRecord(execution) : null,
    events: events.map(toWorkflowEventRecord),
    payments: payments.map(toX402PaymentRecord),
    relayerMessages: relayerMessages.map(toRelayerMessageRecord),
  };
}

export async function listVaultHoldings(ownerWallet?: string) {
  const rows = await prisma.vaultHolding.findMany({
    where: ownerWallet ? { ownerWallet: getAddress(ownerWallet) } : undefined,
    orderBy: [{ chainId: "asc" }, { protocol: "asc" }],
  });
  return rows.map(toVaultHoldingRecord);
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
  return readPoaiEpochRecords(epochId);
}

export async function listPoaiRewardsByDid(did: string): Promise<PoAIRewardRecord[]> {
  const rows = await readPoaiEpochRecords(Number(process.env.POAI_DEFAULT_EPOCH_ID ?? "1"));
  return rows.filter((row) => row.agentDid === did || row.agentDidHash?.toLowerCase() === did.toLowerCase());
}

export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  return toTreasuryOverview(await readTreasurySnapshot());
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
  const row = await prisma.execution.upsert({
    where: { signalId: payload.signalId },
    update: {
      instructionId: payload.instructionId,
      executorDid: payload.executorDid,
      txHash: payload.txHash,
      status: payload.status,
      lzMessageId: payload.lzMessageId,
      slippageBps: payload.slippageBps,
    },
    create: {
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
