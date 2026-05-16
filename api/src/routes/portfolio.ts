import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DepositsResponse, PositionsResponse, VaultHoldingsResponse } from "@orca/shared";
import { getAddress } from "ethers";
import { listDepositsForWallet, listPositionsForWallet, listVaultHoldings } from "../repositories/orca.js";
import { refreshVaultHoldings } from "../services/vault-holdings-indexer.js";

async function walletFromRequest(app: FastifyInstance, request: FastifyRequest): Promise<string> {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    await app.authenticate(request);
    const sub = request.auth?.sub;
    if (typeof sub === "string") {
      return getAddress(sub);
    }
    throw new Error("Invalid session subject");
  }

  const q = request.query as { wallet?: string } | undefined;
  const raw = q?.wallet?.trim();
  if (raw) {
    return getAddress(raw);
  }

  throw new Error("Provide Authorization: Bearer <token> or ?wallet=0x…");
}

export async function registerPortfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me/positions", async (request): Promise<PositionsResponse> => {
    const wallet = await walletFromRequest(app, request);
    return { positions: await listPositionsForWallet(wallet) };
  });

  app.get("/me/deposits", async (request): Promise<DepositsResponse> => {
    const wallet = await walletFromRequest(app, request);
    return { deposits: await listDepositsForWallet(wallet) };
  });

  app.get("/me/vault-holdings", async (request): Promise<VaultHoldingsResponse> => {
    const wallet = await walletFromRequest(app, request);
    return { holdings: await listVaultHoldings(wallet) };
  });

  app.post("/me/vault-holdings/refresh", async (request): Promise<VaultHoldingsResponse> => {
    const wallet = await walletFromRequest(app, request);
    await refreshVaultHoldings(wallet);
    return { holdings: await listVaultHoldings(wallet) };
  });
}
