import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createExecutionRecord } from "../repositories/orca.js";
import { bootstrapAgentsFromEnv, ensureAgentForDid, inferAgentTypeFromDid } from "../db/ensure-agent.js";
import { prisma } from "../db/prisma.js";
import { broadcast } from "../ws/gateway.js";
import {
  deliberationToWorkflowFields,
  parseLlmDeliberation,
  persistAgentDeliberation,
} from "./llm-deliberation.js";

const SIGNAL_STREAM = process.env.SCOUT_REDIS_STREAM_KEY ?? "orca:signals:scout";
const INSTRUCTION_STREAM = process.env.RISK_INSTRUCTION_STREAM_KEY ?? "orca:instructions:risk";
const EXEC_STREAM = process.env.EXECUTION_STREAM_KEY ?? "orca:executions:executor";
const AUDIT_STREAM = process.env.AUDIT_STREAM_KEY ?? "orca:audit";
const RELAYER_STREAM = process.env.RELAYER_STREAM_KEY ?? "orca:relayer";
const GROUP = "orca-api";
const CONSUMER = `api-${process.pid}`;

type StreamPayload = Record<string, unknown>;

function createRedisClient(redisUrl: string, onError: (error: Error) => void): Redis {
  const redis = new Redis(redisUrl, {
    // Railway private networking is IPv6-first; ioredis defaults to IPv4-only DNS.
    family: 0,
    // Blocking XREADGROUP must not retry per command (ioredis default breaks long polls).
    maxRetriesPerRequest: null,
    connectTimeout: 20_000,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  redis.on("error", onError);
  return redis;
}

async function ensureGroup(redis: Redis, stream: string): Promise<void> {
  try {
    await redis.xgroup("CREATE", stream, GROUP, "0", "MKSTREAM");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("BUSYGROUP")) throw error;
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function optionalJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return jsonValue(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed > 0 ? parsed : null;
}

const DECIMAL_20_6_ABS_LIMIT = 100_000_000_000_000;

function normalizeSignalAmountUsdc(value: unknown): number {
  const parsed = asNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  if (Math.abs(parsed) < DECIMAL_20_6_ABS_LIMIT) return parsed;

  const decimals = Number(process.env.SIGNAL_AMOUNT_TOKEN_DECIMALS ?? process.env.PIEUSD_DECIMALS ?? "6");
  const divisor = 10 ** (Number.isFinite(decimals) && decimals >= 0 ? decimals : 6);
  const normalized = parsed / divisor;
  if (Math.abs(normalized) < DECIMAL_20_6_ABS_LIMIT) return normalized;

  return Math.sign(normalized) * (DECIMAL_20_6_ABS_LIMIT - 1);
}

function paymentAmountWei(payload: StreamPayload): string {
  const direct = asString(payload.paymentAmountWei) || asString(payload.amountWei);
  if (direct) return direct;
  const payment = asRecord(payload.payment);
  const nested = asString(payment.amountWei) || asString(payment.amount);
  return nested || process.env.X402_MAX_AMOUNT_REQUIRED_WEI || "100000000000000000";
}

function paymentAsset(payload: StreamPayload): string {
  const direct = asString(payload.paymentAsset) || asString(payload.asset);
  if (direct) return direct;
  const payment = asRecord(payload.payment);
  return asString(payment.asset) || process.env.X402_ASSET_ADDRESS || process.env.PIEUSD_TOKEN_ADDRESS || "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A";
}

function paymentNetwork(payload: StreamPayload): string {
  const direct = asString(payload.paymentNetwork) || asString(payload.network);
  if (direct) return direct;
  const payment = asRecord(payload.payment);
  return asString(payment.network) || process.env.X402_NETWORK || "kite-testnet";
}

function explorerUrl(txHash: string, chainId?: number | null): string {
  void chainId;
  return txHash;
}

async function createWorkflowEvent(params: {
  stream: string;
  streamEventId: string;
  eventType: string;
  signalId?: string | null;
  agentDid?: string | null;
  agentType?: string | null;
  title: string;
  summary: string;
  txHash?: string | null;
  paymentTxHash?: string | null;
  chainId?: number | null;
  payload: StreamPayload;
  deliberationStep?: string;
}) {
  if (params.signalId) {
    const signal = await prisma.signal.findUnique({
      where: { id: params.signalId },
      select: { id: true },
    });
    if (!signal) return;
  }
  const deliberation = parseLlmDeliberation(params.payload);
  const llmFields = deliberation
    ? deliberationToWorkflowFields(deliberation)
    : {
        chainOfThought: null,
        verdict: null,
        verdictSummary: null,
        llmModel: null,
      };
  const summary = llmFields.verdictSummary ?? params.summary;
  if (deliberation && params.agentType && params.deliberationStep) {
    await persistAgentDeliberation({
      signalId: params.signalId,
      agentType: params.agentType as "scout" | "risk" | "executor" | "audit",
      agentDid: params.agentDid,
      step: params.deliberationStep,
      deliberation,
    }).catch(() => undefined);
  }
  await prisma.workflowEvent.upsert({
    where: { stream_streamEventId: { stream: params.stream, streamEventId: params.streamEventId } },
    update: {
      signalId: params.signalId,
      eventType: params.eventType,
      agentDid: params.agentDid,
      agentType: params.agentType,
      title: params.title,
      summary,
      txHash: params.txHash,
      paymentTxHash: params.paymentTxHash,
      chainId: params.chainId,
      chainOfThought: optionalJsonValue(llmFields.chainOfThought),
      verdict: optionalJsonValue(llmFields.verdict),
      verdictSummary: llmFields.verdictSummary,
      llmModel: llmFields.llmModel,
      payload: jsonValue(params.payload),
    },
    create: {
      stream: params.stream,
      streamEventId: params.streamEventId,
      signalId: params.signalId,
      eventType: params.eventType,
      agentDid: params.agentDid,
      agentType: params.agentType,
      title: params.title,
      summary,
      txHash: params.txHash,
      paymentTxHash: params.paymentTxHash,
      chainId: params.chainId,
      chainOfThought: optionalJsonValue(llmFields.chainOfThought),
      verdict: optionalJsonValue(llmFields.verdict),
      verdictSummary: llmFields.verdictSummary,
      llmModel: llmFields.llmModel,
      payload: jsonValue(params.payload),
    },
  });
  if (params.signalId) {
    broadcast({
      type: "workflow.updated",
      at: new Date().toISOString(),
      payload: { signalId: params.signalId, eventType: params.eventType },
    });
  }
}

async function findSignalIdForRelayerEvent(signalId?: string | null, dispatchTxHash?: string | null): Promise<string | null> {
  if (signalId) return signalId;
  if (!dispatchTxHash) return null;

  const executionSignal = await prisma.execution.findFirst({
    where: { txHash: dispatchTxHash },
    select: { signalId: true },
  });
  if (executionSignal?.signalId) return executionSignal.signalId;

  const workflowSignal = await prisma.workflowEvent.findFirst({
    where: { txHash: dispatchTxHash, signalId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { signalId: true },
  });
  if (workflowSignal?.signalId) return workflowSignal.signalId;

  const signal = await prisma.signal.findFirst({
    where: { txHash: dispatchTxHash },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return signal?.id ?? null;
}

async function recordPayment(params: {
  signalId?: string | null;
  instructionId?: string | null;
  fromDid?: string | null;
  toDid: string;
  amountWei?: string | number | null;
  asset?: string | null;
  network?: string | null;
  memo?: string | null;
  txHash?: string | null;
  payload: StreamPayload;
}) {
  if (!params.txHash) return;
  await prisma.x402Payment.upsert({
    where: { txHash: params.txHash },
    update: {
      signalId: params.signalId,
      instructionId: params.instructionId,
      fromDid: params.fromDid,
      toDid: params.toDid,
      amountWei: String(params.amountWei ?? paymentAmountWei(params.payload)),
      asset: params.asset ?? paymentAsset(params.payload),
      network: params.network ?? paymentNetwork(params.payload),
      memo: params.memo,
      payload: jsonValue(params.payload),
    },
    create: {
      signalId: params.signalId,
      instructionId: params.instructionId,
      fromDid: params.fromDid,
      toDid: params.toDid,
      amountWei: String(params.amountWei ?? paymentAmountWei(params.payload)),
      asset: params.asset ?? paymentAsset(params.payload),
      network: params.network ?? paymentNetwork(params.payload),
      memo: params.memo,
      txHash: params.txHash,
      payload: jsonValue(params.payload),
    },
  });
}

async function handleScoutSignal(stream: string, id: string, payload: StreamPayload) {
  const signal = asRecord(payload.signal);
  const signalId = asString(signal.signal_id);
  const scoutDid = asString(signal.scout_did);
  const paymentTxHash = asString(payload.paymentTxHash) || null;
  const suggestedAmountUsdc = normalizeSignalAmountUsdc(signal.suggested_amount);

  await ensureAgentForDid(scoutDid, "scout");

  await prisma.signal.upsert({
    where: { id: signalId },
    update: {
      netDeltaApy: asNumber(signal.net_delta_apy),
      suggestedAmountUsdc,
      txHash: paymentTxHash,
      status: "pending",
    },
    create: {
      id: signalId,
      scoutDid,
      srcChain: asNumber(signal.src_chain),
      dstChain: asNumber(signal.dst_chain),
      srcProtocol: asString(signal.src_protocol),
      dstProtocol: asString(signal.dst_protocol),
      netDeltaApy: asNumber(signal.net_delta_apy),
      suggestedAmountUsdc,
      status: "pending",
      txHash: paymentTxHash,
    },
  });

  await recordPayment({
    signalId,
    fromDid: scoutDid,
    toDid: process.env.RISK_AGENT_DID ?? "risk",
    txHash: paymentTxHash,
    memo: `signal:${signalId}`,
    payload,
  });

  const deliberation = parseLlmDeliberation(payload);
  await createWorkflowEvent({
    stream,
    streamEventId: id,
    eventType: "scout.signal.created",
    signalId,
    agentDid: scoutDid,
    agentType: "scout",
    title: "Scout found opportunity",
    summary:
      deliberation?.verdict_summary ??
      deliberation?.verdictSummary ??
      `${asString(signal.src_protocol)} -> ${asString(signal.dst_protocol)} with ${asString(signal.net_delta_apy)}% net delta`,
    paymentTxHash,
    chainId: asNumber(signal.dst_chain),
    payload,
    deliberationStep: "scout.selection",
  });

  broadcast({
    type: "signal.created",
    at: new Date().toISOString(),
    payload: {
      signal: {
        id: signalId,
        scoutDid,
        srcChain: asNumber(signal.src_chain),
        dstChain: asNumber(signal.dst_chain),
        srcProtocol: asString(signal.src_protocol),
        dstProtocol: asString(signal.dst_protocol),
        netDeltaApy: asNumber(signal.net_delta_apy),
        suggestedAmountUsdc,
        status: "pending",
        txHash: paymentTxHash ?? undefined,
        createdAt: new Date().toISOString(),
      },
    },
  });
}

async function handleRiskInstruction(stream: string, id: string, payload: StreamPayload) {
  const instruction = asRecord(payload.instruction);
  const signalId = asString(instruction.signal_id);
  const instructionId = asString(instruction.instruction_id);
  const riskDid = asString(instruction.risk_did);
  const executorDid = asString(instruction.executor_did);
  const approved = Boolean(instruction.approved);
  const reason = asString(instruction.reason);
  const paymentTxHash = asString(payload.paymentTxHash) || null;
  const suggestedAmountUsdc = normalizeSignalAmountUsdc(instruction.suggested_amount);

  await ensureAgentForDid(riskDid, "risk");
  await ensureAgentForDid(executorDid, "executor");
  const existingSignal = await prisma.signal.findUnique({ where: { id: signalId }, select: { id: true } });
  if (!existingSignal) {
    const sourceSignal = asRecord(payload.signal);
    const scoutDid = asString(sourceSignal.scout_did) || process.env.SCOUT_DID || "did:kite:orca/scout-1";
    await ensureAgentForDid(scoutDid, "scout");
    await prisma.signal.upsert({
      where: { id: signalId },
      update: {},
      create: {
        id: signalId,
        scoutDid,
        srcChain: asNumber(instruction.src_chain),
        dstChain: asNumber(instruction.dst_chain),
        srcProtocol: asString(instruction.src_protocol),
        dstProtocol: asString(instruction.dst_protocol),
        netDeltaApy: asNumber(instruction.net_delta_apy),
        suggestedAmountUsdc,
        status: "pending",
      },
    });
  }

  await prisma.riskInstruction.upsert({
    where: { signalId },
    update: {
      riskDid,
      executorDid,
      approved,
      reason,
      sourceSignalHash: asString(payload.sourceSignalHash) || null,
      paymentTxHash,
      signature: asString(instruction.signature) || null,
      payload: jsonValue(payload),
    },
    create: {
      id: instructionId,
      signalId,
      riskDid,
      executorDid,
      approved,
      reason,
      sourceSignalHash: asString(payload.sourceSignalHash) || null,
      paymentTxHash,
      signature: asString(instruction.signature) || null,
      payload: jsonValue(payload),
    },
  });

  await prisma.signal.update({
    where: { id: signalId },
    data: { status: approved ? "approved" : "rejected", riskDecisionReason: reason },
  });

  await recordPayment({
    signalId,
    instructionId,
    fromDid: riskDid,
    toDid: executorDid,
    txHash: paymentTxHash,
    memo: `signal:${signalId}`,
    payload,
  });

  await createWorkflowEvent({
    stream,
    streamEventId: id,
    eventType: "risk.instruction.created",
    signalId,
    agentDid: riskDid,
    agentType: "risk",
    title: approved ? "Risk approved signal" : "Risk rejected signal",
    summary: reason,
    paymentTxHash,
    payload,
    deliberationStep: "risk.approval",
  });
}

async function handleExecution(stream: string, id: string, payload: StreamPayload) {
  const signalId = asString(payload.signal_id);
  const txHash = asString(payload.tx_hash);
  const paymentTxHash = asString(payload.paymentTxHash) || null;
  const executorDid = asString(payload.executor_did);
  const txChainId = asNullableNumber(payload.txChainId);
  await ensureAgentForDid(executorDid, "executor");
  const execution = await createExecutionRecord({
    signalId,
    instructionId: asString(payload.instruction_id),
    executorDid: asString(payload.executor_did),
    txHash,
    status: asString(payload.status),
  });
  await prisma.execution.update({
    where: { id: execution.id },
    data: { paymentTxHash, payload: jsonValue(payload) },
  });
  await prisma.signal.update({
    where: { id: signalId },
    data: { status: payload.success ? "executed" : "failed", txHash },
  });

  await recordPayment({
    signalId,
    instructionId: asString(payload.instruction_id),
    fromDid: asString(payload.executor_did),
    toDid: process.env.AUDIT_AGENT_DID ?? "audit",
    txHash: paymentTxHash,
    memo: `signal:${signalId}`,
    payload,
  });

  await createWorkflowEvent({
    stream,
    streamEventId: id,
    eventType: "execution.settled",
    signalId,
    agentDid: asString(payload.executor_did),
    agentType: "executor",
    title: payload.success ? "Executor settled transaction" : "Executor failed transaction",
    summary: `Execution ${asString(payload.status)} with tx ${explorerUrl(txHash)}`,
    txHash,
    paymentTxHash,
    chainId: txChainId,
    payload,
    deliberationStep: "executor.execution",
  });

  const relatedTxs = Array.isArray(payload.relatedTxs) ? payload.relatedTxs : [];
  for (const [index, item] of relatedTxs.entries()) {
    const tx = asRecord(item);
    const relatedTxHash = asString(tx.txHash);
    if (!relatedTxHash) continue;
    await createWorkflowEvent({
      stream,
      streamEventId: `${id}:related:${index}:${relatedTxHash}`,
      eventType: asString(tx.kind) || "executor.related_tx",
      signalId,
      agentDid: executorDid,
      agentType: "executor",
      title: asString(tx.label) || "Executor transaction",
      summary: `${asString(tx.label) || "Executor transaction"} ${explorerUrl(relatedTxHash)}`,
      txHash: relatedTxHash,
      chainId: asNullableNumber(tx.chainId) ?? txChainId,
      payload: { ...payload, relatedTx: tx },
    });
  }

  const poaiTxHash = asString(payload.poaiTxHash);
  if (poaiTxHash && !relatedTxs.some((item) => asString(asRecord(item).txHash) === poaiTxHash)) {
    await createWorkflowEvent({
      stream,
      streamEventId: `${id}:poai:${poaiTxHash}`,
      eventType: "executor.poai.recorded",
      signalId,
      agentDid: executorDid,
      agentType: "executor",
      title: "Executor PoAI attribution",
      summary: `Executor recorded PoAI attribution ${explorerUrl(poaiTxHash)}`,
      txHash: poaiTxHash,
      chainId: asNullableNumber(payload.poaiChainId) ?? txChainId,
      payload,
    });
  }

  broadcast({
    type: "execution.created",
    at: new Date().toISOString(),
    payload: { executionId: execution.id, signalId: execution.signalId, status: execution.status },
  });
  broadcast({
    type: "execution.settled",
    at: new Date().toISOString(),
    payload: { signalId, txHash, status: payload.success ? "success" : "failed" },
  });
}

async function handleRelayer(stream: string, id: string, payload: StreamPayload) {
  const dispatchTxHash = asString(payload.dispatchTxHash) || null;
  const signalId = await findSignalIdForRelayerEvent(asString(payload.signalId) || null, dispatchTxHash);
  const messageId = asString(payload.messageId);
  if (!messageId) return;
  await prisma.relayerMessage.upsert({
    where: { messageId },
    update: {
      signalId,
      originDomain: asNumber(payload.originDomain),
      destinationDomain: asNumber(payload.destinationDomain),
      recipient: asString(payload.recipient),
      dispatchTxHash,
      deliveryTxHash: asString(payload.deliveryTxHash) || null,
      status: asString(payload.status) || "unknown",
      payload: jsonValue(payload),
    },
    create: {
      signalId,
      messageId,
      originDomain: asNumber(payload.originDomain),
      destinationDomain: asNumber(payload.destinationDomain),
      recipient: asString(payload.recipient),
      dispatchTxHash,
      deliveryTxHash: asString(payload.deliveryTxHash) || null,
      status: asString(payload.status) || "unknown",
      payload: jsonValue(payload),
    },
  });
  await createWorkflowEvent({
    stream,
    streamEventId: id,
    eventType: `relayer.${asString(payload.status) || "message"}`,
    signalId,
    agentType: "relayer",
    title: "Relayer message update",
    summary: `Message ${messageId} ${asString(payload.status) || "updated"}`,
    txHash: asString(payload.deliveryTxHash) || asString(payload.dispatchTxHash) || null,
    chainId: asString(payload.deliveryTxHash)
      ? asNullableNumber(payload.destinationDomain)
      : asNullableNumber(payload.originDomain),
    payload,
  });
}

async function handleGeneric(stream: string, id: string, payload: StreamPayload) {
  const eventType = asString(payload.event) || "agent.event";
  const signalId = asString(payload.signalId) || asString(payload.signal_id) || null;
  const did = asString(payload.agentDid) || asString(payload.agent_did) || null;
  const title = asString(payload.title) || (eventType.includes("poai") ? "PoAI attribution" : "Agent event");
  const summary = asString(payload.summary) || eventType;
  await createWorkflowEvent({
    stream,
    streamEventId: id,
    eventType,
    signalId,
    agentDid: did,
    agentType: asString(payload.agentType) || (did ? inferAgentTypeFromDid(did) : null),
    title,
    summary,
    txHash: asString(payload.txHash) || asString(payload.tx_hash) || null,
    paymentTxHash: asString(payload.paymentTxHash) || null,
    chainId: asNullableNumber(payload.chainId),
    payload,
  });
}

async function handlePayload(stream: string, id: string, payload: StreamPayload) {
  if (stream === SIGNAL_STREAM && payload.event === "scout.signal.created") {
    await handleScoutSignal(stream, id, payload);
    return;
  }
  if (stream === INSTRUCTION_STREAM && payload.event === "risk.instruction.created") {
    await handleRiskInstruction(stream, id, payload);
    return;
  }
  if (stream === EXEC_STREAM && payload.event === "execution.settled") {
    await handleExecution(stream, id, payload);
    return;
  }
  if (stream === RELAYER_STREAM) {
    await handleRelayer(stream, id, payload);
    return;
  }
  await handleGeneric(stream, id, payload);
}

export async function startStreamIngestor(app: FastifyInstance, redisUrl: string): Promise<() => Promise<void>> {
  const redis = createRedisClient(redisUrl, (error) => {
    app.log.warn({ error }, "Redis connection error");
  });
  const bootstrapped = await bootstrapAgentsFromEnv();
  if (bootstrapped > 0) {
    app.log.info({ count: bootstrapped }, "Bootstrapped agents from env");
  }
  const streams = [SIGNAL_STREAM, INSTRUCTION_STREAM, EXEC_STREAM, AUDIT_STREAM, RELAYER_STREAM];
  for (const stream of streams) {
    await ensureGroup(redis, stream);
  }

  let running = true;
  const processRecord = async (stream: string, id: string, fields: string[]) => {
    try {
      const payloadIndex = fields.findIndex((fieldName: string) => fieldName === "payload");
      const payloadRaw = payloadIndex >= 0 ? fields[payloadIndex + 1] : undefined;
      if (!payloadRaw) {
        app.log.error("Missing payload in stream event %s", id);
        return;
      }
      const payload = JSON.parse(payloadRaw) as StreamPayload;
      await handlePayload(stream, id, payload);
      await redis.xack(stream, GROUP, id);
    } catch (error) {
      app.log.error({ error, stream, id }, "Failed to ingest stream event");
    }
  };
  const recoverPending = async () => {
    for (const stream of streams) {
      const response = await redis.xautoclaim(stream, GROUP, CONSUMER, 1_000, "0-0", "COUNT", 20);
      const claimed = response?.[1] as [string, string[]][] | undefined;
      if (!claimed?.length) continue;
      app.log.info({ stream, count: claimed.length }, "Recovering pending stream events");
      for (const [id, fields] of claimed) {
        await processRecord(stream, id, fields);
      }
    }
  };
  const loop = async () => {
    while (running) {
      try {
        await recoverPending();
        const entries = await redis.xreadgroup(
          "GROUP",
          GROUP,
          CONSUMER,
          "COUNT",
          "20",
          "BLOCK",
          "30000",
          "STREAMS",
          ...streams,
          ...streams.map(() => ">"),
        );
        if (!entries) continue;
        const streamEntries = entries as [string, string[][]][];
        for (const [stream, records] of streamEntries) {
          for (const [id, fields] of records as [string, string[]][]) {
            await processRecord(stream, id, fields);
          }
        }
      } catch (error) {
        app.log.error({ error }, "Redis stream ingestor error; retrying");
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  };

  void loop();
  return async () => {
    running = false;
    await redis.quit();
  };
}
