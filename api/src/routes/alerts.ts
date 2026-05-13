import type { FastifyInstance } from "fastify";
import type { AlertsResponse } from "@orca/shared";
import type { WsEnvelope } from "@orca/shared";
import { createAlert, listAlerts } from "../repositories/orca.js";
import { config } from "../config.js";
import { verifyHmacSha256 } from "../utils/hmac.js";
import { broadcast } from "../ws/gateway.js";
import { z } from "zod";

const webhookSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
});

export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/alerts", async (): Promise<AlertsResponse> => {
    return { alerts: await listAlerts() };
  });

  app.post<{ Body: { type: string; message: string; severity: "info" | "warning" | "critical" } }>(
    "/alerts/webhook",
    async (request, reply) => {
      const rawBody = JSON.stringify(request.body ?? {});
      const signature = request.headers["x-orca-signature"] as string | undefined;

      if (config.webhookSecret) {
        const valid = verifyHmacSha256(rawBody, signature, config.webhookSecret);
        if (!valid) {
          return reply.status(401).send({ ok: false, error: "Invalid signature" });
        }
      }

      const parsed = webhookSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid webhook payload" });
      }

      const alert = await createAlert(parsed.data);

      const event: WsEnvelope<"alert.created"> = {
        type: "alert.created",
        at: new Date().toISOString(),
        payload: { alert },
      };
      broadcast(event);

      return { ok: true, alert };
    }
  );
}
