import type { FastifyInstance } from "fastify";
import type { ApiHealthResponse } from "@orca/shared";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.head("/health", async (_, reply): Promise<void> => {
    reply.code(200).send();
  });

  app.get("/health", async (): Promise<ApiHealthResponse> => {
    return {
      status: "ok",
      service: "orca-api",
      timestamp: new Date().toISOString(),
    };
  });
}
