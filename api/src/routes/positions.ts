import type { FastifyInstance } from "fastify";
import type { PositionHistoryResponse, PositionsResponse } from "@orca/shared";
import { listPositions } from "../repositories/orca.js";

export async function registerPositionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/positions", async (): Promise<PositionsResponse> => {
    return { positions: await listPositions() };
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
