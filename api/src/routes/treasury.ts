import type { FastifyInstance } from "fastify";
import type { TreasuryResponse } from "@orca/shared";
import { getTreasuryOverview } from "../repositories/orca.js";

export async function registerTreasuryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/treasury/balance", async (request): Promise<TreasuryResponse> => {
    await app.authenticate(request);
    return { treasury: await getTreasuryOverview() };
  });
}
