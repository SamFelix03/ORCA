import { Redis } from "ioredis";
import type { FastifyInstance } from "fastify";
import { createExecutionRecord } from "../repositories/orca.js";
import { prisma } from "../db/prisma.js";
import { broadcast } from "../ws/gateway.js";

const SIGNAL_STREAM = process.env.SCOUT_REDIS_STREAM_KEY ?? "orca:signals:scout";
const INSTRUCTION_STREAM = process.env.RISK_INSTRUCTION_STREAM_KEY ?? "orca:instructions:risk";
const EXEC_STREAM = process.env.EXECUTION_STREAM_KEY ?? "orca:executions:executor";
const GROUP = "orca-api";
const CONSUMER = `api-${process.pid}`;

async function ensureGroup(redis: Redis, stream: string): Promise<void> {
  try {
    await redis.xgroup("CREATE", stream, GROUP, "$", "MKSTREAM");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("BUSYGROUP")) throw error;
  }
}

export async function startStreamIngestor(app: FastifyInstance, redisUrl: string): Promise<() => Promise<void>> {
  const redis = new Redis(redisUrl);
  await ensureGroup(redis, SIGNAL_STREAM);
  await ensureGroup(redis, INSTRUCTION_STREAM);
  await ensureGroup(redis, EXEC_STREAM);

  let running = true;
  const loop = async () => {
    while (running) {
      const entries = await redis.xreadgroup(
        "GROUP",
        GROUP,
        CONSUMER,
        "COUNT",
        "20",
        "BLOCK",
        "30000",
        "STREAMS",
        SIGNAL_STREAM,
        INSTRUCTION_STREAM,
        EXEC_STREAM,
        ">",
        ">",
        ">",
      );
      if (!entries) continue;
      const streamEntries = entries as [string, string[][]][];
      for (const [stream, records] of streamEntries) {
        for (const [id, fields] of records as [string, string[]][]) {
          const payloadIndex = fields.findIndex((fieldName: string) => fieldName === "payload");
          const payloadRaw = payloadIndex >= 0 ? fields[payloadIndex + 1] : undefined;
          if (!payloadRaw) {
            app.log.error("Missing payload in stream event %s", id);
            continue;
          }
          const payload = JSON.parse(payloadRaw);
          if (stream === SIGNAL_STREAM && payload.event === "scout.signal.created") {
            const signal = payload.signal;
            await prisma.signal.upsert({
              where: { id: signal.signal_id },
              update: {
                netDeltaApy: signal.net_delta_apy,
                suggestedAmountUsdc: signal.suggested_amount,
                txHash: payload.paymentTxHash || null,
                status: "pending",
              },
              create: {
                id: signal.signal_id,
                scoutDid: signal.scout_did,
                srcChain: signal.src_chain,
                dstChain: signal.dst_chain,
                srcProtocol: signal.src_protocol,
                dstProtocol: signal.dst_protocol,
                netDeltaApy: signal.net_delta_apy,
                suggestedAmountUsdc: signal.suggested_amount,
                status: "pending",
                txHash: payload.paymentTxHash || null,
              },
            });
            broadcast({
              type: "signal.created",
              at: new Date().toISOString(),
              payload: { signal: {
                id: signal.signal_id,
                scoutDid: signal.scout_did,
                srcChain: signal.src_chain,
                dstChain: signal.dst_chain,
                srcProtocol: signal.src_protocol,
                dstProtocol: signal.dst_protocol,
                netDeltaApy: Number(signal.net_delta_apy),
                suggestedAmountUsdc: Number(signal.suggested_amount),
                status: "pending",
                txHash: payload.paymentTxHash || undefined,
                createdAt: new Date().toISOString(),
              } },
            });
          } else if (stream === EXEC_STREAM && payload.event === "execution.settled") {
            const execution = await createExecutionRecord({
              signalId: payload.signal_id,
              instructionId: payload.instruction_id,
              executorDid: payload.executor_did,
              txHash: payload.tx_hash,
              status: payload.status,
            });
            await prisma.signal.update({
              where: { id: payload.signal_id },
              data: { status: payload.success ? "executed" : "failed", txHash: payload.tx_hash },
            });
            broadcast({
              type: "execution.created",
              at: new Date().toISOString(),
              payload: { executionId: execution.id, signalId: execution.signalId, status: execution.status },
            });
            broadcast({
              type: "execution.settled",
              at: new Date().toISOString(),
              payload: { signalId: payload.signal_id, txHash: payload.tx_hash, status: payload.success ? "success" : "failed" },
            });
          }
          await redis.xack(stream, GROUP, id);
        }
      }
    }
  };

  void loop();
  return async () => {
    running = false;
    await redis.quit();
  };
}
