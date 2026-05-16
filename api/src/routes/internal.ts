import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const relayerEventSchema = z.object({
  signalId: z.string().optional(),
  messageId: z.string().min(1),
  originDomain: z.number().int(),
  destinationDomain: z.number().int(),
  recipient: z.string().min(1),
  dispatchTxHash: z.string().optional(),
  deliveryTxHash: z.string().optional(),
  status: z.string().min(1),
});

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
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
      await prisma.workflowEvent.create({
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
      }).catch(() => undefined);
    }
    return { ok: true };
  });
}
