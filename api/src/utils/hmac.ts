import crypto from "node:crypto";

export function verifyHmacSha256(payload: string, headerSignature: string | undefined, secret: string): boolean {
  if (!headerSignature || !secret) {
    return false;
  }

  const computed = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  const headerBuffer = Buffer.from(headerSignature, "utf8");
  const computedBuffer = Buffer.from(computed, "utf8");

  if (headerBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuffer, computedBuffer);
}
