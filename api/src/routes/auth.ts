import type { FastifyInstance } from "fastify";
import type { AuthNonceResponse, AuthVerifyResponse } from "@orca/shared";
import { issueJwt } from "../lib/jwt.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { address: string } }>("/auth/nonce", async (request): Promise<AuthNonceResponse> => {
    const address = request.body?.address ?? "0x0000000000000000000000000000000000000000";
    const nonce = crypto.randomUUID();

    return {
      address,
      nonce,
      message: `Sign this ORCA nonce: ${nonce}`,
    };
  });

  app.post<{ Body: { address: string; signature: string; nonce: string } }>(
    "/auth/verify",
    async (request): Promise<AuthVerifyResponse> => {
      const address = request.body?.address;
      const signature = request.body?.signature;
      const nonce = request.body?.nonce;
      if (!address || !signature || !nonce) {
        throw new Error("address, signature and nonce are required");
      }
      return {
        token: issueJwt({ sub: address, nonce }),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    }
  );
}
