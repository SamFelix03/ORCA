import type { FastifyInstance } from "fastify";
import type { SignalsResponse } from "@orca/shared";
import { getSignalById, listSignals } from "../repositories/orca.js";

export async function registerSignalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/signals", async (): Promise<SignalsResponse> => {
    return { signals: await listSignals() };
  });

  app.get<{ Params: { id: string } }>("/signals/:id", async (request) => {
    const signal = await getSignalById(request.params.id);

    if (!signal) {
      return {
        error: "Signal not found",
      };
    }

    return { signal };
  });
}
