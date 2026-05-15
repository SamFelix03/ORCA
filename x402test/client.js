/**
 * x402 Hello World Client — Kite Testnet
 *
 * Full x402 v2 payment flow with Pieverse facilitator.
 *
 * Key facts discovered by debugging:
 *  - Pieverse facilitator runs x402 v2 (not v1)
 *  - Network must be in CAIP-2 format: "eip155:2368" (not "kite-testnet")
 *  - Body shape: { x402Version:2, paymentPayload:{...}, paymentRequirements:{...} }
 *
 * Install deps:  npm install axios ethers
 * Run:           node client.js
 *
 * ⚠️  TESTNET ONLY — never hardcode a real key with funds.
 */

const axios      = require("axios");
const { ethers } = require("ethers");

// ─── CONFIG ────────────────────────────────────────────────────────────────

const SERVER_URL          = "http://localhost:3000/hello";
const KITE_TESTNET_RPC    = "https://rpc-testnet.gokite.ai";
const USDC_ADDRESS        = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const FACILITATOR_ADDRESS = "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b";

// ⚠️  Testnet dummy key — local testing only.
const PRIVATE_KEY = "0x7a425200e31e8409c27abbc9aaae49a94c314426ef2e569d3a33ffc289a34e76";

// ─── EIP-3009 typed-data ───────────────────────────────────────────────────

const EIP3009_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)",
];

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
};

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  const provider  = new ethers.JsonRpcProvider(KITE_TESTNET_RPC);
  const signer    = new ethers.Wallet(PRIVATE_KEY, provider);
  const myAddress = await signer.getAddress();
  console.log(`\n👛 Client wallet: ${myAddress}`);

  // ── STEP 1: Call server without payment → expect 402 ────────────────────
  console.log("\n📡 Step 1 — Calling server without payment...");
  let paymentTerms;
  try {
    await axios.get(SERVER_URL);
    console.log("⚠️  Got 200 without payment — server is not protected!");
    return;
  } catch (err) {
    if (err.response?.status === 402) {
      paymentTerms = err.response.data;
      console.log("✅  Got 402 Payment Required as expected.");
    } else {
      console.error("❌  Unexpected error:", err.message);
      process.exit(1);
    }
  }

  const requirements = paymentTerms.accepts[0];
  const { maxAmountRequired, payTo, maxTimeoutSeconds } = requirements;
  console.log(`   Amount : ${maxAmountRequired} wei`);
  console.log(`   Pay to : ${payTo}`);

  // ── STEP 2: Sign EIP-3009 transferWithAuthorization ─────────────────────
  console.log("\n🔏 Step 2 — Signing EIP-3009 authorization...");

  const usdc = new ethers.Contract(USDC_ADDRESS, EIP3009_ABI, provider);
  const [tokenName, tokenVersion] = await Promise.all([
    usdc.name(),
    usdc.version().catch(() => "1"),
  ]);
  const { chainId } = await provider.getNetwork();

  // Pieverse x402 v2 requires CAIP-2 network format
  const caip2Network = `eip155:${chainId}`;
  console.log(`   Token    : ${tokenName} v${tokenVersion}  |  Chain: ${chainId}`);
  console.log(`   Network  : ${caip2Network}`);

  const nonce       = ethers.hexlify(ethers.randomBytes(32));
  const now         = Math.floor(Date.now() / 1000);
  const validAfter  = 0;
  const validBefore = now + Number(maxTimeoutSeconds);

  const domain = {
    name:              tokenName,
    version:           tokenVersion,
    chainId:           Number(chainId),
    verifyingContract: USDC_ADDRESS,
  };

  const authMessage = {
    from:        myAddress,
    to:          FACILITATOR_ADDRESS,
    value:       BigInt(maxAmountRequired),
    validAfter:  BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  const signature = await signer.signTypedData(domain, TRANSFER_WITH_AUTH_TYPES, authMessage);
  console.log(`   Signature: ${signature.slice(0, 22)}...`);

  // ── STEP 3: Build the X-Payment header ──────────────────────────────────
  //
  // Pieverse x402 v2 format (confirmed from their tweet + Coinbase docs):
  //
  //   {
  //     x402Version: 2,
  //     paymentPayload: {
  //       x402Version: 2,
  //       scheme: "gokite-aa",
  //       network: "eip155:2368",        ← CAIP-2 format!
  //       payload: {
  //         signature: "0x...",
  //         authorization: { from, to, value, validAfter, validBefore, nonce }
  //       }
  //     },
  //     paymentRequirements: {           ← echo the server's 402 terms back
  //       ...but network also in CAIP-2 format
  //     }
  //   }

  // Build paymentRequirements echoing server terms but with CAIP-2 network
  const paymentRequirements = {
    ...requirements,
    network: caip2Network,              // override "kite-testnet" → "eip155:2368"
  };

  const xPaymentObject = {
    x402Version: 2,
    paymentPayload: {
      x402Version: 2,
      scheme:      "gokite-aa",
      network:     caip2Network,
      payload: {
        signature,
        authorization: {
          from:        myAddress,
          to:          FACILITATOR_ADDRESS,
          value:       maxAmountRequired,       // string — no BigInt in JSON
          validAfter:  String(validAfter),
          validBefore: String(validBefore),
          nonce,
        },
      },
    },
    paymentRequirements,
  };

  const xPaymentHeader = Buffer.from(JSON.stringify(xPaymentObject)).toString("base64");
  console.log("\n📤 Step 3 — Re-sending request with X-Payment header...");

  // ── STEP 4: Get the Hello World response ─────────────────────────────────
  try {
    const response = await axios.get(SERVER_URL, {
      headers: { "X-Payment": xPaymentHeader },
    });
    console.log("\n🎉 Step 4 — SUCCESS! Server responded:");
    console.log("   Status:", response.status);
    console.log("   Body  :", JSON.stringify(response.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error("\n❌ Server rejected payment:");
      console.error("   Status:", err.response.status);
      console.error("   Body  :", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("\n❌ Network error:", err.message);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});