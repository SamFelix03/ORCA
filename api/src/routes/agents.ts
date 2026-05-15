import type { FastifyInstance } from "fastify";
import type { AgentActionsResponse, AgentsResponse } from "@orca/shared";
import { listAgents } from "../repositories/orca.js";

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/agents", async (request): Promise<AgentsResponse> => {
    await app.authenticate(request);
    return { agents: await listAgents() };
  });

  app.get<{ Params: { did: string } }>("/agents/:did/actions", async (request): Promise<AgentActionsResponse> => {
    await app.authenticate(request);
    const did = decodeURIComponent(request.params.did);
    throw new Error(`Agent action history for ${did} must be served from persistent audit records`);
  });
}
