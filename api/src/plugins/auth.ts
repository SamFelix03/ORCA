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
      request.auth = {};
      return;
    }
    const token = authHeader.slice("Bearer ".length);
    try {
      request.auth = verifyJwt(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid bearer token";
      const err = new Error(message) as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
