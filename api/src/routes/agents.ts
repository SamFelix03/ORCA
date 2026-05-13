import type { FastifyInstance } from "fastify";
import type { AgentActionsResponse, AgentsResponse } from "@orca/shared";
import { listAgents } from "../repositories/orca.js";
import { mockActionsByAgent } from "../lib/mock-store.js";

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/agents", async (): Promise<AgentsResponse> => {
    return { agents: await listAgents() };
  });

  app.get<{ Params: { did: string } }>("/agents/:did/actions", async (request): Promise<AgentActionsResponse> => {
    const did = decodeURIComponent(request.params.did);
    return {
      did,
      actions: mockActionsByAgent[did] ?? [],
    };
  });
}
