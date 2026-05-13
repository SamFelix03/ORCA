import type { FastifyInstance } from "fastify";
import type { TreasuryPendingResponse, TreasuryResponse } from "@orca/shared";
import { getTreasuryOverview } from "../repositories/orca.js";

export async function registerTreasuryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/treasury/balance", async (): Promise<TreasuryResponse> => {
    return { treasury: await getTreasuryOverview() };
  });

  app.get("/treasury/multisig/pending", async (): Promise<TreasuryPendingResponse> => {
    return {
      pending: [
        { id: "ms-1", to: "0xaaaa...aaaa", valueUsdc: 10000, approvals: 2, required: 3 },
        { id: "ms-2", to: "0xbbbb...bbbb", valueUsdc: 5000, approvals: 3, required: 3 },
      ],
    };
  });
}
