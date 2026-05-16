/**
 * After a hub warp dispatch: try to complete delivery on the destination (ProcessId + balance check).
 * Optionally runs in-repo relay orchestration (spawns `hyperlane status --relay`).
 *
 *   cd contracts
 *   KITE_WARP_TX=0x... HYP_DEST=sepolia pnpm exec hardhat run scripts/hyperlane/attempt-message-delivery.ts --network kiteTestnet
 *   # or: MESSAGE_ID=0x... HYP_DEST=sepolia ATTEMPT_RELAY=1 ...
 */
import path from "node:path";
import dotenv from "dotenv";
import hre from "hardhat";
import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { getRpcUrl, hardhatNetworkForDestKey } from "./providers";
import { erc20Balance, routerToken } from "./warp";
import {
  attemptHyperlaneRelay,
  DEST_KEY_TO_HYP_CHAIN,
  isMessageProcessedOnDest,
  messageIdFromTxHash,
} from "./delivery";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const dispatchTx = process.env.KITE_WARP_TX?.trim() || process.env.DISPATCH_TX?.trim();
  let messageId = process.env.MESSAGE_ID?.trim();
  const attemptRelay = process.env.ATTEMPT_RELAY !== "0";

  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (attemptRelay && !pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY for relay attempt");
  }

  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);
  const destNet = hardhatNetworkForDestKey(destKey);
  const destRpc = getRpcUrl(hre, destNet);
  const destProvider = new ethers.JsonRpcProvider(destRpc);

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  if (!messageId && dispatchTx) {
    messageId = await messageIdFromTxHash(ethers.provider, dispatchTx);
  }
  if (!messageId) {
    throw new Error("Set MESSAGE_ID or KITE_WARP_TX / DISPATCH_TX");
  }

  const destToken = await routerToken(route.destinationRouter, destProvider);
  const balBefore = await erc20Balance(destToken, recipient, destProvider);
  const head = await destProvider.getBlockNumber();
  const fromBlock = Math.max(0, head - 20_000);

  let proc = await isMessageProcessedOnDest(route.destinationMailbox, messageId, destProvider, fromBlock);

  const report: Record<string, unknown> = {
    messageId,
    dispatchTx: dispatchTx ?? null,
    destMailbox: route.destinationMailbox,
    destToken,
    recipient,
    balBefore: balBefore.toString(),
    processBeforeRelay: proc,
  };

  if (!proc.found && attemptRelay) {
    // eslint-disable-next-line no-console -- CLI
    console.log("--- ORCA relayer (in-repo) ---");
    const hypDest = DEST_KEY_TO_HYP_CHAIN[destKey] ?? destKey;
    const relay = attemptHyperlaneRelay({
      privateKey: pk!,
      destinationChain: hypDest,
      messageId,
      dispatchTx: dispatchTx || undefined,
      timeoutSec: Number(process.env.RELAY_TIMEOUT_SEC ?? "180"),
    });
    report.relayAttempt = { ok: relay.ok, outputTail: relay.output.slice(-4000) };
    proc = await isMessageProcessedOnDest(route.destinationMailbox, messageId, destProvider, fromBlock);
  }

  const balAfter = await erc20Balance(destToken, recipient, destProvider);
  report.processAfter = proc;
  report.balAfter = balAfter.toString();
  report.delta = (balAfter - balBefore).toString();
  report.delivered = proc.found || balAfter > balBefore;

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.delivered ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
