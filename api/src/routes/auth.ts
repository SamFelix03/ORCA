import type { FastifyInstance } from "fastify";
import type { AuthNonceResponse, AuthVerifyResponse } from "@orca/shared";

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
    async (): Promise<AuthVerifyResponse> => {
      return {
        token: `mock-jwt-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    }
  );
}
