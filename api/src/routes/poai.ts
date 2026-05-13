import type { FastifyInstance } from "fastify";
import type { PoAIAgentHistoryResponse, PoAIEpochRewardsResponse } from "@orca/shared";
import { listPoaiRewardsByDid, listPoaiRewardsByEpoch } from "../repositories/orca.js";

export async function registerPoAIRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/poai/epoch/:id/rewards", async (request): Promise<PoAIEpochRewardsResponse> => {
    const epochId = Number(request.params.id);

    return {
      epochId,
      rewards: await listPoaiRewardsByEpoch(epochId),
    };
  });

  app.get<{ Params: { did: string } }>("/poai/agents/:did/history", async (request): Promise<PoAIAgentHistoryResponse> => {
    const did = decodeURIComponent(request.params.did);

    return {
      did,
      rewards: await listPoaiRewardsByDid(did),
    };
  });
}
