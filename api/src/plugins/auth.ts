import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyJwt } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { sub?: string; nonce?: string; exp?: number; iat?: number; [key: string]: unknown };
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing bearer token");
    }
    const token = authHeader.slice("Bearer ".length);
    request.auth = verifyJwt(token);
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
