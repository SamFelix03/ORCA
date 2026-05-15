import type { FastifyInstance } from "fastify";
import type { ExecutionResponse, ExecutionsResponse } from "@orca/shared";
import { getExecutionById, listExecutions } from "../repositories/orca.js";

export async function registerExecutionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/executions", async (): Promise<ExecutionsResponse> => {
    return { executions: await listExecutions() };
  });

  app.get<{ Params: { id: string } }>("/executions/:id", async (request): Promise<ExecutionResponse> => {
    const execution = await getExecutionById(request.params.id);
    if (!execution) {
      throw new Error("Execution not found");
    }
    return { execution };
  });
}
