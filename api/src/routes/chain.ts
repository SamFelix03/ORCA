import type { FastifyInstance } from "fastify";
import { readKiteNetworkStatus, readRegistryEpoch, readSpendingWindowSnapshot } from "../adapters/kite.js";

export async function registerChainRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chain/status", async () => {
    const [network, epoch, spendingWindow] = await Promise.all([
      readKiteNetworkStatus(),
      readRegistryEpoch(),
      readSpendingWindowSnapshot(),
    ]);

    return {
      network,
      registryEpoch: epoch,
      spendingWindow,
    };
  });
}
