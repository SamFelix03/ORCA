import type { FastifyInstance } from "fastify";
import type { ScoutPayoutsResponse, ScoutsResponse } from "@orca/shared";
import { z } from "zod";
import { listScoutPayouts, listScouts, registerScout } from "../repositories/orca.js";

const registerSchema = z.object({
  did: z.string().min(3),
  ownerAddress: z.string().min(42),
  stakeUsdc: z.number().positive(),
});

export async function registerScoutRoutes(app: FastifyInstance): Promise<void> {
  app.get("/scouts", async (): Promise<ScoutsResponse> => {
    return { scouts: await listScouts() };
  });

  app.post("/scouts/register", async (request) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new Error("Invalid scout registration payload");
    }
    const scout = await registerScout(parsed.data);
    return { scout };
  });

  app.get<{ Params: { did?: string } }>("/scouts/payouts/:did?", async (request): Promise<ScoutPayoutsResponse> => {
    return { payouts: await listScoutPayouts(request.params.did) };
  });
}
