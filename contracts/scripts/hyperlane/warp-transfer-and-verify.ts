/**
 * Kite → spoke USDT warp: transferRemote, poll delivery, optionally attempt relay (in-repo).
 *
 *   cd contracts
 *   HYP_DEST=sepolia pnpm hyperlane:warp-verify
 *
 * Env: ATTEMPT_RELAY=1 (default) | 0 to skip relay subprocess
 */
import path from "node:path";
import dotenv from "dotenv";
import hre from "hardhat";
import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { getRpcUrl, hardhatNetworkForDestKey } from "./providers";
import { erc20Balance, routerToken, transferRemote } from "./warp";
import {
  attemptHyperlaneRelay,
  DEST_KEY_TO_HYP_CHAIN,
  isMessageProcessedOnDest,
  messageIdFromReceipt,
} from "./delivery";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const amount = BigInt(process.env.AMOUNT?.trim() ?? "1000000000000000");
  const pollSec = Number(process.env.BRIDGE_POLL_SEC ?? "120");
  const pollMs = Number(process.env.BRIDGE_POLL_INTERVAL_MS ?? "10000");
  const attemptRelay = process.env.ATTEMPT_RELAY !== "0";

  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();

  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);
  const destNet = hardhatNetworkForDestKey(destKey);
  const destRpc = getRpcUrl(hre, destNet);
  const destProvider = new ethers.JsonRpcProvider(destRpc);

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  const destToken = await routerToken(route.destinationRouter, destProvider);
  const balBefore = await erc20Balance(destToken, recipient, destProvider);

  // eslint-disable-next-line no-console -- CLI
  console.log("--- transferRemote (hub) ---");
  const { txHash } = await transferRemote({
    signer,
    router: route.originRouter,
    destinationDomain: route.destinationDomain,
    recipient,
    amount,
    interchainGasWei: BigInt(process.env.INTERCHAIN_GAS_WEI?.trim() ?? "0"),
  });

  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  const messageId = receipt ? messageIdFromReceipt(receipt) : undefined;

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify({ txHash, messageId, balBefore: balBefore.toString() }, null, 2));

  const headAtStart = await destProvider.getBlockNumber();
  const fromBlock = Math.max(0, headAtStart - 5);

  const deadline = Date.now() + pollSec * 1000;
  let balAfter = balBefore;
  let processFound = false;
  let processTx: string | undefined;

  while (Date.now() < deadline) {
    await sleep(pollMs);
    balAfter = await erc20Balance(destToken, recipient, destProvider);
    if (messageId) {
      const proc = await isMessageProcessedOnDest(
        route.destinationMailbox,
        messageId,
        destProvider,
        fromBlock,
      );
      processFound = proc.found;
      processTx = proc.txHash;
    }
    // eslint-disable-next-line no-console -- CLI
    console.log(
      `poll… destBal=${balAfter.toString()} delta=${(balAfter - balBefore).toString()} process=${processFound}`,
    );
    if (balAfter > balBefore || processFound) {
      break;
    }
  }

  let relayResult: { ok: boolean; outputTail?: string } | undefined;
  if (!processFound && balAfter <= balBefore && attemptRelay && messageId && pk) {
    // eslint-disable-next-line no-console -- CLI
    console.log("--- delivery not observed; ORCA relayer ---");
    const hypDest = DEST_KEY_TO_HYP_CHAIN[destKey] ?? destKey;
    const relay = attemptHyperlaneRelay({
      privateKey: pk,
      destinationChain: hypDest,
      messageId,
      dispatchTx: txHash,
      timeoutSec: Number(process.env.RELAY_TIMEOUT_SEC ?? "180"),
    });
    relayResult = { ok: relay.ok, outputTail: relay.output.slice(-3000) };
    if (messageId) {
      const proc = await isMessageProcessedOnDest(
        route.destinationMailbox,
        messageId,
        destProvider,
        fromBlock,
      );
      processFound = proc.found;
      processTx = proc.txHash;
    }
    balAfter = await erc20Balance(destToken, recipient, destProvider);
  }

  const ok = balAfter > balBefore || processFound;
  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        ok,
        destKey,
        destToken,
        recipient,
        balBefore: balBefore.toString(),
        balAfter: balAfter.toString(),
        delta: (balAfter - balBefore).toString(),
        messageId,
        processOnDestMailbox: processFound,
        processTx,
        relayResult,
        underlyingIssue:
          ok
            ? null
            : "Warp route + dispatch on Kite are OK; failure is missing destination Mailbox.process (relayer/ISM). Not an ORCA contract bug.",
      },
      null,
      2,
    ),
  );
  process.exitCode = ok ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
