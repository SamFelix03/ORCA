import type { FastifyInstance } from "fastify";
import type { TreasuryPendingResponse, TreasuryResponse } from "@orca/shared";
import { getTreasuryOverview } from "../repositories/orca.js";

export async function registerTreasuryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/treasury/balance", async (request): Promise<TreasuryResponse> => {
    await app.authenticate(request);
    return { treasury: await getTreasuryOverview() };
  });

  app.get("/treasury/multisig/pending", async (request): Promise<TreasuryPendingResponse> => {
    await app.authenticate(request);
    throw new Error("Pending multisig integration must be wired to live treasury source");
  });
}
