import type { FastifyInstance } from "fastify";
import type { WsEnvelope } from "@orca/shared";
import type { SessionsResponse } from "@orca/shared";
import { approveSession, expireSession, listSessions } from "../repositories/orca.js";
import { broadcast } from "../ws/gateway.js";
import { z } from "zod";

const sessionIdSchema = z.object({ sessionId: z.string().min(1) });

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sessions", async (): Promise<SessionsResponse> => {
    return { sessions: await listSessions() };
  });

  app.post<{ Body: { sessionId: string } }>("/sessions/approve", async (request) => {
    const parsed = sessionIdSchema.safeParse(request.body);
    if (!parsed.success) {
      return { ok: false, error: "Invalid sessionId" };
    }

    const session = await approveSession(parsed.data.sessionId);

    if (!session) {
      return { ok: false, error: "Session not found" };
    }

    const event: WsEnvelope<"session.updated"> = {
      type: "session.updated",
      at: new Date().toISOString(),
      payload: { session },
    };
    broadcast(event);

    return { ok: true, session };
  });

  app.delete<{ Params: { id: string } }>("/sessions/:id", async (request) => {
    const session = await expireSession(request.params.id);

    if (!session) {
      return { ok: false, error: "Session not found" };
    }

    const event: WsEnvelope<"session.updated"> = {
      type: "session.updated",
      at: new Date().toISOString(),
      payload: { session },
    };
    broadcast(event);

    return { ok: true, session };
  });
}
