import type { FastifyInstance } from "fastify";
import type { PositionHistoryResponse, PositionsResponse, VaultHoldingsResponse } from "@orca/shared";
import { listPositions, listVaultHoldings } from "../repositories/orca.js";

export async function registerPositionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/positions", async (): Promise<PositionsResponse> => {
    return { positions: await listPositions() };
  });

  app.get("/vault-holdings", async (): Promise<VaultHoldingsResponse> => {
    return { holdings: await listVaultHoldings() };
  });

  app.get<{ Params: { id: string } }>("/positions/:id/history", async (request): Promise<PositionHistoryResponse> => {
    const positions = await listPositions();
    const position = positions.find((item) => item.id === request.params.id);

    return {
      positionId: request.params.id,
      history: position ? [position] : [],
    };
  });
}
