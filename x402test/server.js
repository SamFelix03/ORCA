/**
 * x402 Hello World Server — Kite Testnet (gokite-aa scheme)
 *
 * This server is designed to be paid by a Kite Passport agent wallet.
 * The CLIENT is NOT a script — it is the `kpass` CLI / Passport agent.
 *
 * Flow:
 *   1. Passport agent calls GET /hello → gets 402 with gokite-aa payment terms
 *   2. Passport agent signs a session-keyed authorization and resends with X-Payment
 *   3. Server decodes X-Payment, calls Pieverse /v2/verify then /v2/settle
 *   4. Server returns Hello World on success
 *
 * Install deps:  npm install express axios
 * Run:           node server.js
 *
 * Then test with the kpass CLI:
 *   kpass agent:session execute \
 *     --url http://localhost:3000/hello \
 *     --method GET \
 *     --output json
 */

const express = require("express");
const axios   = require("axios");

const app = express();
app.use(express.json());

// ─── CONFIG ────────────────────────────────────────────────────────────────

const PORT = 3000;

// Your server's wallet — payments land here after the facilitator settles
const PAY_TO_ADDRESS    = "0x5732e1bccAEB161E3B93D126010042B0F1b9CFC9"; // replace with yours
const PIEUSD_TOKEN      = "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A"; // Kite testnet PIEUSD
const PRICE_IN_WEI      = "100000000000000000";                          // 0.1 PIEUSD
const FACILITATOR_URL   = "https://facilitator.pieverse.io";
const SERVER_PUBLIC_URL = `https://459d-103-98-63-34.ngrok-free.app`;

// ─── HELPERS ───────────────────────────────────────────────────────────────

function make402Body() {
  return {
    error: "X-PAYMENT header is required",
    accepts: [{
      scheme:            "gokite-aa",       // Kite Passport account-abstraction scheme
      network:           "kite-testnet",
      maxAmountRequired: PRICE_IN_WEI,
      resource:          `${SERVER_PUBLIC_URL}/hello`,
      description:       "Hello World API — pay to say hello!",
      mimeType:          "application/json",
      outputSchema: {
        input: {
          discoverable: true,
          method:       "GET",
          queryParams:  {},
          type:         "http",
        },
        output: {
          properties: {
            message: { description: "The hello world message", type: "string" },
          },
          required: ["message"],
          type:     "object",
        },
      },
      payTo:             PAY_TO_ADDRESS,
      maxTimeoutSeconds: 300,
      asset:             PIEUSD_TOKEN,
      extra:             null,
      merchantName:      "Hello World Service",
    }],
    x402Version: 1,
  };
}

// ─── ROUTES ────────────────────────────────────────────────────────────────

/**
 * GET /hello
 *
 * Step 1: No X-Payment header → return 402 with gokite-aa payment terms.
 *         The Passport agent reads this and knows what to sign.
 *
 * Step 2: X-Payment present → decode → verify → settle → respond.
 */
app.get("/hello", async (req, res) => {
  const xPaymentHeader = req.headers["x-payment"];

  // ── No payment → 402 ────────────────────────────────────────────────────
  if (!xPaymentHeader) {
    console.log("⬅️  Request without payment — returning 402");
    return res.status(402).json(make402Body());
  }

  // ── Decode X-Payment ─────────────────────────────────────────────────────
  // The Passport agent base64-encodes its payment object and puts it here.
  // The exact internal shape is produced by the Passport session signer —
  // we just forward it as-is to the Pieverse facilitator.
  let xPaymentObject;
  try {
    const decoded = Buffer.from(xPaymentHeader, "base64").toString("utf8");
    xPaymentObject = JSON.parse(decoded);
    console.log("\n📥 X-Payment received:", JSON.stringify(xPaymentObject, null, 2));
  } catch (err) {
    return res.status(400).json({ error: "Invalid X-Payment header encoding", detail: err.message });
  }

  // The Passport agent always includes paymentPayload + paymentRequirements
  const { paymentPayload, paymentRequirements } = xPaymentObject;

  if (!paymentPayload || !paymentRequirements) {
    // Log what we actually got so you can see the real shape from the agent
    console.error("❌ X-Payment missing expected fields. Got keys:", Object.keys(xPaymentObject));
    return res.status(400).json({
      error:    "X-Payment must contain paymentPayload and paymentRequirements",
      received: Object.keys(xPaymentObject),
    });
  }

  // ── Verify with Pieverse ─────────────────────────────────────────────────
  console.log("\n🔍 Verifying with Pieverse facilitator...");
  try {
    const verifyResp = await axios.post(`${FACILITATOR_URL}/v2/verify`, {
      paymentPayload,
      paymentRequirements,
    });

    const isValid = verifyResp.data?.valid ?? verifyResp.data?.isValid;
    if (!isValid) {
      console.warn("   ❌ Verification failed:", verifyResp.data);
      return res.status(402).json({ error: "Payment verification failed", detail: verifyResp.data });
    }
    console.log("   ✅ Verified!");
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    console.error("   Verification error:", detail);
    return res.status(402).json({ error: "Payment verification error", detail });
  }

  // ── Settle on-chain ──────────────────────────────────────────────────────
  console.log("⛓️  Settling on-chain...");
  try {
    const settleResp = await axios.post(`${FACILITATOR_URL}/v2/settle`, {
      paymentPayload,
      paymentRequirements,
    });

    const txHash = settleResp.data?.transaction ?? settleResp.data?.txHash ?? "settled";
    console.log(`   ✅ Settled! TX: ${txHash}`);

    return res.status(200).json({
      message:      "Hello, World! 👋 Payment received from your Passport agent.",
      settlementTx: txHash,
    });
  } catch (err) {
    const detail = err.response?.data ?? err.message;
    console.error("   Settlement error:", detail);
    return res.status(402).json({ error: "Payment settlement failed", detail });
  }
});

// ── Debug endpoint — shows raw X-Payment without trying to settle ──────────
// Useful to inspect exactly what shape the Passport agent sends
app.get("/hello-debug", (req, res) => {
  const xPaymentHeader = req.headers["x-payment"];
  if (!xPaymentHeader) {
    return res.status(402).json(make402Body());
  }
  try {
    const decoded = Buffer.from(xPaymentHeader, "base64").toString("utf8");
    const parsed  = JSON.parse(decoded);
    console.log("\n🔬 Debug — raw X-Payment from agent:\n", JSON.stringify(parsed, null, 2));
    return res.status(200).json({ received: parsed });
  } catch (err) {
    return res.status(400).json({ error: "Could not decode X-Payment", detail: err.message });
  }
});

// ── Health ─────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:    "x402 Hello World Server running",
    endpoints: { protected: "/hello", debug: "/hello-debug" },
    payTo:     PAY_TO_ADDRESS,
    price:     `${PRICE_IN_WEI} wei (0.1 PIEUSD)`,
    scheme:    "gokite-aa",
  });
});

// ─── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 x402 Hello World Server on http://localhost:${PORT}`);
  console.log(`   Protected endpoint : GET /hello`);
  console.log(`   Debug endpoint     : GET /hello-debug`);
  console.log(`   Scheme             : gokite-aa (Kite Passport agent wallet)`);
  console.log(`   payTo              : ${PAY_TO_ADDRESS}`);
  console.log(`   price              : ${PRICE_IN_WEI} wei (0.1 PIEUSD)\n`);
  console.log(`   ℹ️  Test with:`);
  console.log(`   kpass agent:session execute --url http://localhost:3000/hello --method GET --output json\n`);
});
