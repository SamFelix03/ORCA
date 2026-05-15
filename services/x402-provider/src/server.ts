import "dotenv/config";

import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 8099);
const HOST = process.env.HOST ?? "0.0.0.0";
const PUBLIC_RESOURCE_URL = process.env.PUBLIC_RESOURCE_URL?.trim();
const EXECUTE_PATH = process.env.EXECUTE_PATH ?? "/execute";
const PAY_TO = process.env.X402_PAY_TO?.trim() ?? "";
const ASSET =
  process.env.X402_ASSET_ADDRESS?.trim() ??
  "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const MAX_AMOUNT = process.env.X402_MAX_AMOUNT_REQUIRED_WEI?.trim() ?? "1000000";
const MERCHANT_NAME = process.env.X402_MERCHANT_NAME?.trim() ?? "ORCA agent micropayment rail";
const MAX_TIMEOUT_SECONDS = Number(process.env.X402_MAX_TIMEOUT_SECONDS ?? 300);
const STUB_MODE = (process.env.X402_PROVIDER_STUB ?? "true").toLowerCase() === "true";
const FACILITATOR_URL = (process.env.FACILITATOR_URL ?? "https://facilitator.pieverse.io").replace(/\/$/, "");
const SKIP_VERIFY = (process.env.X402_SKIP_VERIFY ?? "false").toLowerCase() === "true";
const DEBUG_PAYMENT_SHAPE = (process.env.X402_DEBUG_PAYMENT_SHAPE ?? "false").toLowerCase() === "true";

/** CAIP-2 chain id for Pieverse `exact` on Kite (see facilitator /v2/supported). */
const CAIP_NETWORK =
  process.env.X402_CAIP_NETWORK?.trim() ||
  (process.env.KITE_CHAIN_ID?.trim() ? `eip155:${process.env.KITE_CHAIN_ID.trim()}` : "eip155:2368");

const X402_FACILITATOR_VERSION = 2 as const;

type JsonObject = Record<string, unknown>;

/** Fields Pieverse/x402 v2 expects for `paymentRequirements` (facilitator verify/settle). */
function buildV2PaymentRequirements(): JsonObject {
  return {
    scheme: "exact",
    network: CAIP_NETWORK,
    asset: ASSET,
    amount: MAX_AMOUNT,
    payTo: PAY_TO,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    ...(process.env.X402_PAYMENT_EXTRA_JSON?.trim()
      ? { extra: JSON.parse(process.env.X402_PAYMENT_EXTRA_JSON) as JsonObject }
      : {}),
  };
}

function eqEvmAddr(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return a === b;
  return a.toLowerCase() === b.toLowerCase();
}

function eqUintString(a: unknown, b: unknown): boolean {
  try {
    return BigInt(String(a).trim()) === BigInt(String(b).trim());
  } catch {
    return String(a).trim() === String(b).trim();
  }
}

/** HTTP 402 `accepts[0]` aligned with v2 terms + Kite-style discovery fields Passport expects. */
function paymentAcceptChallenge(resourceUrl: string): JsonObject {
  const core = buildV2PaymentRequirements();
  const payToDisplay = PAY_TO || "0x0000000000000000000000000000000000000001";
  return {
    ...core,
    payTo: payToDisplay,
    resource: resourceUrl,
    description: "ORCA inter-agent x402 micropayment (execute)",
    mimeType: "application/json",
    maxAmountRequired: MAX_AMOUNT,
    outputSchema: {
      input: {
        discoverable: true,
        method: "POST",
        type: "http",
      },
      output: {
        properties: {
          txHash: { description: "Settlement transaction hash", type: "string" },
        },
        required: ["txHash"],
        type: "object",
      },
    },
    extra: (core.extra as JsonObject | undefined) ?? null,
    merchantName: MERCHANT_NAME,
  };
}

function challenge(resourceUrl: string) {
  return {
    error: "X-PAYMENT header is required",
    accepts: [paymentAcceptChallenge(resourceUrl)],
    x402Version: X402_FACILITATOR_VERSION,
  };
}

function decodeXPayment(header: string): JsonObject {
  let decoded: string;
  try {
    decoded = Buffer.from(header, "base64").toString("utf8");
  } catch {
    throw new Error("invalid_base64");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload_not_object");
  }
  return parsed as JsonObject;
}

function paymentShapeDebugFingerprint(obj: JsonObject): { keys: string[]; shallowHash: string } {
  const keys = Object.keys(obj).sort();
  const shallowHash = createHash("sha256").update(keys.join(",")).digest("hex").slice(0, 16);
  return { keys, shallowHash };
}

/** Legacy Kite curl-style body (authorization + signature at top level, no `payload`). */
function isLegacyAuthorizationPayload(o: JsonObject): boolean {
  return (
    o.payload === undefined &&
    typeof o.signature === "string" &&
    typeof o.authorization === "object" &&
    o.authorization !== null &&
    !Array.isArray(o.authorization)
  );
}

/** Already-shaped x402 v2 payment proof (has nested authorization/signature). */
function isV2NestedPayload(o: JsonObject): boolean {
  const p = o.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const pl = p as JsonObject;
  return typeof pl.signature === "string" && typeof pl.authorization === "object" && pl.authorization !== null;
}

function acceptedMatchesRequirements(
  accepted: JsonObject | undefined,
  requirements: JsonObject,
): { ok: boolean; detail?: string } {
  if (!accepted) return { ok: false, detail: "missing accepted in payment payload" };
  if (String(accepted.scheme) !== String(requirements.scheme)) {
    return { ok: false, detail: `accepted.scheme mismatch (client=${String(accepted.scheme)})` };
  }
  if (String(accepted.network).toLowerCase() !== String(requirements.network).toLowerCase()) {
    return {
      ok: false,
      detail: `accepted.network mismatch (client=${String(accepted.network)} server=${String(requirements.network)})`,
    };
  }
  if (!eqEvmAddr(accepted.asset, requirements.asset)) {
    return { ok: false, detail: "accepted.asset mismatch" };
  }
  if (!eqUintString(accepted.amount, requirements.amount)) {
    return { ok: false, detail: "accepted.amount mismatch" };
  }
  if (!eqEvmAddr(accepted.payTo, requirements.payTo)) {
    return { ok: false, detail: "accepted.payTo mismatch" };
  }
  const cTimeout = accepted.maxTimeoutSeconds;
  const rTimeout = requirements.maxTimeoutSeconds;
  if (Number(cTimeout) !== Number(rTimeout)) {
    return { ok: false, detail: "accepted.maxTimeoutSeconds mismatch" };
  }
  return { ok: true };
}

function buildResourceDescriptor(resourceUrl: string): JsonObject {
  return {
    url: resourceUrl,
    description: "ORCA inter-agent x402 micropayment (execute)",
    mimeType: "application/json",
  };
}

/**
 * Produce facilitator-ready `paymentPayload` (x402 v2 inner proof).
 */
function normalizePaymentPayload(
  decoded: JsonObject,
  paymentRequirements: JsonObject,
  resourceUrl: string,
): { payload: JsonObject } | { error: string; status: number } {
  const acceptedCore = { ...paymentRequirements };
  delete acceptedCore.extra;

  if (decoded.x402Version === X402_FACILITATOR_VERSION && isV2NestedPayload(decoded)) {
    const innerAccepted = decoded.accepted as JsonObject | undefined;
    const match = acceptedMatchesRequirements(innerAccepted, paymentRequirements);
    if (!match.ok) {
      return { error: match.detail ?? "accepted mismatch", status: 502 };
    }
    return {
      payload: {
        x402Version: X402_FACILITATOR_VERSION,
        accepted: innerAccepted as JsonObject,
        payload: decoded.payload,
        resource:
          decoded.resource && typeof decoded.resource === "object"
            ? (decoded.resource as JsonObject)
            : buildResourceDescriptor(resourceUrl),
      },
    };
  }

  if (isLegacyAuthorizationPayload(decoded)) {
    return {
      payload: {
        x402Version: X402_FACILITATOR_VERSION,
        accepted: { ...paymentRequirements },
        payload: {
          signature: decoded.signature,
          authorization: decoded.authorization,
        },
        resource: buildResourceDescriptor(resourceUrl),
      },
    };
  }

  const keys = Object.keys(decoded).sort().join(",");
  return {
    error: `unsupported X-Payment shape (keys: ${keys}); enable X402_DEBUG_PAYMENT_SHAPE for fingerprints`,
    status: 502,
  };
}

function extractTxHash(raw: Record<string, unknown>): string {
  const direct = raw.txHash ?? raw.transactionHash ?? raw.tx_hash;
  if (typeof direct === "string" && direct.startsWith("0x")) return direct;
  const nested = raw.result;
  if (nested && typeof nested === "object") {
    const r = nested as Record<string, unknown>;
    const h = r.txHash ?? r.transactionHash;
    if (typeof h === "string" && h.startsWith("0x")) return h;
  }
  const data = raw.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const h = d.txHash ?? d.transactionHash;
    if (typeof h === "string" && h.startsWith("0x")) return h;
  }
  return "";
}

async function facilitatorPost(
  path: "/v2/verify" | "/v2/settle",
  body: JsonObject,
): Promise<{ ok: boolean; status: number; parsed: Record<string, unknown>; raw: string }> {
  const res = await fetch(`${FACILITATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    /* empty */
  }
  return { ok: res.ok, status: res.status, parsed, raw };
}

async function main() {
  if (!PUBLIC_RESOURCE_URL) {
    console.warn(
      "[x402-provider] PUBLIC_RESOURCE_URL is unset — resource URLs in 402 challenges fall back to Host/proto. " +
        "Passport matching is picky: set PUBLIC_RESOURCE_URL to the exact URL kpass calls (e.g. https://YOUR_TUNNEL/execute).",
    );
  }

  if (!STUB_MODE && !PAY_TO) {
    console.error("[x402-provider] Set X402_PAY_TO (merchant payout wallet on Kite) when X402_PROVIDER_STUB=false.");
    process.exit(1);
  }

  if (!STUB_MODE && DEBUG_PAYMENT_SHAPE) {
    console.warn("[x402-provider] X402_DEBUG_PAYMENT_SHAPE=true — logs decoded payment shape metadata only.");
  }

  const paymentRequirements = buildV2PaymentRequirements();

  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post(EXECUTE_PATH, async (req, reply) => {
    const xfProto = req.headers["x-forwarded-proto"];
    const proto = typeof xfProto === "string" ? xfProto.split(",")[0].trim() : "http";
    const host = typeof req.headers.host === "string" ? req.headers.host : `${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
    const pathNorm = EXECUTE_PATH.startsWith("/") ? EXECUTE_PATH : `/${EXECUTE_PATH}`;
    const derivedUrl = `${proto}://${host}${pathNorm}`;
    const resourceUrl = PUBLIC_RESOURCE_URL || derivedUrl;

    const rawHeader = req.headers["x-payment"] ?? req.headers["payment-signature"];
    const paymentHeader = typeof rawHeader === "string" ? rawHeader.trim() : "";

    if (!paymentHeader) {
      return reply.code(402).send(challenge(resourceUrl));
    }

    if (STUB_MODE) {
      const txHash = `0x${randomBytes(32).toString("hex")}`;
      req.log.warn({ stub: true }, "X402_PROVIDER_STUB=true — synthetic txHash");
      return { txHash };
    }

    let decoded: JsonObject;
    try {
      decoded = decodeXPayment(paymentHeader);
    } catch (e) {
      const code = e instanceof Error ? e.message : "decode_error";
      req.log.warn({ code }, "X-Payment decode failed");
      return reply.code(400).send({ error: "invalid X-Payment header", code });
    }

    if (DEBUG_PAYMENT_SHAPE) {
      const fp = paymentShapeDebugFingerprint(decoded);
      req.log.info({ paymentKeys: fp.keys, shallowHash: fp.shallowHash }, "decoded X-Payment shape");
    }

    const reqForSettlement = {
      x402Version: X402_FACILITATOR_VERSION,
      paymentRequirements,
      paymentPayload: {} as JsonObject,
    };

    const normalized = normalizePaymentPayload(decoded, paymentRequirements, resourceUrl);
    if ("error" in normalized) {
      req.log.error(normalized, "payment normalization failed");
      return reply.code(normalized.status).send({ error: normalized.error });
    }
    reqForSettlement.paymentPayload = normalized.payload;

    if (!SKIP_VERIFY) {
      const verified = await facilitatorPost("/v2/verify", reqForSettlement);
      if (!verified.ok) {
        req.log.error({ status: verified.status, parsed: verified.parsed }, "facilitator verify failed");
        return reply.code(502).send({
          error: "facilitator verify failed",
          detail: verified.parsed.error ?? verified.parsed,
          status: verified.status,
        });
      }
      const v = verified.parsed;
      if (v.isValid === false || v.valid === false) {
        req.log.error({ parsed: v }, "facilitator verify rejected payload");
        return reply.code(502).send({ error: "facilitator verify rejected", detail: v });
      }
    }

    const settled = await facilitatorPost("/v2/settle", reqForSettlement);
    let parsed = settled.parsed;
    if (!settled.ok) {
      req.log.error({ status: settled.status, parsed }, "facilitator settle failed");
      return reply.code(502).send({
        error: "facilitator settle failed",
        detail: parsed.error ?? parsed,
        status: settled.status,
      });
    }

    const txHash = extractTxHash(parsed);
    if (!txHash) {
      return reply.code(502).send({ error: "settle response missing txHash", raw: parsed });
    }
    return { txHash };
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    { caip: CAIP_NETWORK, stub: STUB_MODE },
    `ORCA x402 provider listening http://${HOST}:${PORT}${EXECUTE_PATH.startsWith("/") ? EXECUTE_PATH : `/${EXECUTE_PATH}`}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
