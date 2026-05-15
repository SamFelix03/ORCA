import crypto from "node:crypto";
import { config } from "../config.js";

function base64UrlEncode(input: Buffer | string): string {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf-8");
  return source.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function issueJwt(payload: Record<string, unknown>, expiresInSeconds = 3600): string {
  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET is required in strict mode.");
  }
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", config.jwtSecret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyJwt(token: string): Record<string, unknown> {
  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET is required in strict mode.");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = base64UrlEncode(crypto.createHmac("sha256", config.jwtSecret).update(signingInput).digest());
  if (expected !== encodedSignature) throw new Error("Invalid signature");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as Record<string, unknown>;
  const exp = payload.exp;
  if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}
