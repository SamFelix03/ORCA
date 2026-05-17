import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ensureAgentForDid, shouldLinkWorkflowEvent } from "../db/ensure-agent.js";
import { prisma } from "../db/prisma.js";
import { readSpendingWindowSnapshot } from "../adapters/kite.js";
import {
  deliberationToWorkflowFields,
  parseLlmDeliberation,
  persistAgentDeliberation,
} from "../workers/llm-deliberation.js";
import { broadcast } from "../ws/gateway.js";

const relayerEventSchema = z.object({
  signalId: z.string().optional(),
  messageId: z.string().min(1),
  originDomain: z.number().int(),
  destinationDomain: z.number().int(),
  recipient: z.string().min(1),
  dispatchTxHash: z.string().optional(),
  deliveryTxHash: z.string().optional(),
  status: z.string().min(1),
  error: z.string().optional(),
});

const deliberationSchema = z.object({
  signalId: z.string().optional().nullable(),
  agentType: z.enum(["scout", "risk", "executor", "audit"]),
  agentDid: z.string().optional().nullable(),
  step: z.string().min(1),
  llmDeliberation: z.record(z.unknown()),
});

function assertInternalKey(request: { headers: Record<string, unknown> }) {
  const expected = process.env.ORCA_INTERNAL_API_KEY?.trim();
  if (!expected) return;
  const provided = request.headers["x-orca-internal-key"];
  if (provided !== expected) {
    throw new Error("Unauthorized internal request");
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    try {
      assertInternalKey(request);
    } catch {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }
  });

  app.get<{ Querystring: { signalId: string } }>("/internal/risk-context", async (request, reply) => {
    const signalId = request.query.signalId?.trim();
    if (!signalId) {
      return reply.status(400).send({ ok: false, error: "signalId required" });
    }
    const signal = await prisma.signal.findUnique({ where: { id: signalId } });
    const recentSignals = signal
      ? await prisma.signal.findMany({
          where: { scoutDid: signal.scoutDid },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];
    const vaultAddress =
      signal && typeof signal === "object"
        ? (
            await prisma.riskInstruction.findUnique({
              where: { signalId },
              select: { payload: true },
            })
          )?.payload
        : null;
    let vaultAddr: string | null = null;
    if (vaultAddress && typeof vaultAddress === "object" && !Array.isArray(vaultAddress)) {
      const instruction = (vaultAddress as { instruction?: { execution_intent?: { vault_address?: string } } })
        .instruction;
      vaultAddr = instruction?.execution_intent?.vault_address ?? null;
    }
    const holdings = vaultAddr
      ? await prisma.vaultHolding.findMany({ where: { vaultAddress: vaultAddr }, take: 20 })
      : [];
    const positions = await prisma.position.findMany({
      where: signal
        ? { OR: [{ chainId: signal.srcChain }, { chainId: signal.dstChain }] }
        : undefined,
      take: 20,
    });
    const scoutMarketplace = signal
      ? await prisma.scoutMarketplace.findFirst({ where: { did: signal.scoutDid } })
      : null;
    let spendingWindow: unknown = null;
    try {
      spendingWindow = await readSpendingWindowSnapshot();
    } catch {
      spendingWindow = null;
    }
    return {
      available: true,
      signal,
      recentSignals,
      vaultHoldings: holdings,
      positions,
      scoutMarketplace,
      spendingWindow,
    };
  });

  app.post("/internal/agent-deliberation", async (request, reply) => {
    const parsed = deliberationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }
    const body = parsed.data;
    const deliberation = parseLlmDeliberation({ llmDeliberation: body.llmDeliberation });
    if (!deliberation) {
      return reply.status(400).send({ ok: false, error: "Invalid llmDeliberation" });
    }
    if (body.agentDid) {
      await ensureAgentForDid(body.agentDid, body.agentType);
    }
    await persistAgentDeliberation({
      signalId: body.signalId,
      agentType: body.agentType,
      agentDid: body.agentDid,
      step: body.step,
      deliberation,
    });
    let workflowEventSkipped = false;
    if (body.signalId) {
      const signal = await prisma.signal.findUnique({
        where: { id: body.signalId },
        select: { id: true },
      });
      if (shouldLinkWorkflowEvent(body.signalId, signal)) {
        const fields = deliberationToWorkflowFields(deliberation);
        await prisma.workflowEvent.create({
          data: {
            signalId: body.signalId,
            stream: "http:agent-deliberation",
            streamEventId: `${body.step}:${Date.now()}`,
            eventType: `agent.${body.agentType}.deliberation`,
            agentDid: body.agentDid,
            agentType: body.agentType,
            title: `${body.agentType} deliberation`,
            summary: fields.verdictSummary ?? body.step,
            chainOfThought: fields.chainOfThought,
            verdict: fields.verdict,
            verdictSummary: fields.verdictSummary,
            llmModel: fields.llmModel,
            payload: jsonValue(body.llmDeliberation),
          },
        });
        broadcast({
          type: "workflow.updated",
          at: new Date().toISOString(),
          payload: { signalId: body.signalId, eventType: `agent.${body.agentType}.deliberation` },
        });
      } else {
        workflowEventSkipped = true;
        request.log.warn({ signalId: body.signalId }, "Skipped workflow event: signal not ingested yet");
      }
    }
    return { ok: true, workflowEventSkipped };
  });

  app.post("/internal/relayer-event", async (request, reply) => {
    const parsed = relayerEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }
    const body = parsed.data;
    const executionSignal = body.signalId
      ? null
      : body.dispatchTxHash
        ? await prisma.execution.findFirst({
            where: { txHash: body.dispatchTxHash },
            select: { signalId: true },
          })
        : null;
    const signalId = body.signalId ?? executionSignal?.signalId ?? null;

    await prisma.relayerMessage.upsert({
      where: { messageId: body.messageId },
      update: {
        signalId,
        originDomain: body.originDomain,
        destinationDomain: body.destinationDomain,
        recipient: body.recipient,
        dispatchTxHash: body.dispatchTxHash ?? null,
        deliveryTxHash: body.deliveryTxHash ?? null,
        status: body.status,
        payload: body,
      },
      create: {
        signalId,
        messageId: body.messageId,
        originDomain: body.originDomain,
        destinationDomain: body.destinationDomain,
        recipient: body.recipient,
        dispatchTxHash: body.dispatchTxHash ?? null,
        deliveryTxHash: body.deliveryTxHash ?? null,
        status: body.status,
        payload: body,
      },
    });
    if (signalId) {
      await prisma.workflowEvent
        .create({
          data: {
            signalId,
            stream: "http:relayer",
            streamEventId: `${body.messageId}:${body.status}`,
            eventType: `relayer.${body.status}`,
            agentType: "relayer",
            title: "Relayer message update",
            summary: `Message ${body.messageId} ${body.status}`,
            txHash: body.deliveryTxHash ?? body.dispatchTxHash ?? null,
            payload: body,
          },
        })
        .catch(() => undefined);
    }
    return { ok: true };
  });
}
