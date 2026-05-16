/**
 * On-chain Hyperlane warp diagnostics (no CLI): enrollment, quotes, mailboxes, recent delivery.
 *
 *   cd contracts
 *   HYP_DEST=sepolia pnpm exec hardhat run scripts/hyperlane/diagnose-warp-route.ts --network kiteTestnet
 *
 * Optional: KITE_WARP_TX=0x... — also decode dispatch + scan dest mailbox for ProcessId.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { getRpcUrl, hardhatNetworkForDestKey, hubHardhatNetwork } from "./providers";
import hre from "hardhat";
import { isMessageProcessedOnDest, messageIdFromTxHash } from "./delivery";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const ROUTER_ABI = [
  "function token() view returns (address)",
  "function quoteTransferRemote(uint32 destination, bytes32 recipient, uint256 amount) view returns (tuple(address token, uint256 amount)[] memory)",
  "function routers(uint32 domain) view returns (bytes32)",
  "function remoteRouters(uint32 domain) view returns (bytes32)",
  "function owner() view returns (address)",
  "function mailbox() view returns (address)",
  "function hook() view returns (address)",
];

async function readEnrolledRouter(
  router: ethers.Contract,
  domain: number,
): Promise<{ enrolled: string | null; tried: string[] }> {
  const tried: string[] = [];
  for (const fn of ["routers", "remoteRouters"] as const) {
    try {
      const raw = (await router[fn](domain)) as string;
      tried.push(fn);
      if (raw && raw !== ethers.ZeroHash) {
        return { enrolled: raw, tried };
      }
    } catch {
      /* method missing */
    }
  }
  return { enrolled: null, tried };
}

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const amount = BigInt(process.env.AMOUNT?.trim() ?? "1000000000000000");

  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);
  const destNet = hardhatNetworkForDestKey(destKey);
  const hubNet = hubHardhatNetwork(hre);
  const destRpc = getRpcUrl(hre, destNet);
  const destProvider = new ethers.JsonRpcProvider(destRpc);

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;
  const recipientB32 = ethers.zeroPadValue(recipient, 32);

  const router = new ethers.Contract(route.originRouter, ROUTER_ABI, ethers.provider);
  const enrollment = await readEnrolledRouter(router, route.destinationDomain);
  const expectedDestRouterB32 = route.destinationRouterBytes32;

  let quotes: Array<{ token: string; amount: string; isNative: boolean }> = [];
  try {
    const raw = (await router.quoteTransferRemote(route.destinationDomain, recipientB32, amount)) as Array<{
      token: string;
      amount: bigint;
    }>;
    quotes = raw.map((q) => ({
      token: q.token,
      amount: q.amount.toString(),
      isNative: q.token.toLowerCase() === ethers.ZeroAddress.toLowerCase(),
    }));
  } catch (e) {
    quotes = [{ token: "error", amount: (e as Error).message, isNative: false }];
  }

  let owner: string | undefined;
  let routerMailbox: string | undefined;
  let hook: string | undefined;
  try {
    owner = await router.owner();
  } catch {
    /* */
  }
  try {
    routerMailbox = await router.mailbox();
  } catch {
    /* */
  }
  try {
    hook = await router.hook();
  } catch {
    /* */
  }

  const enrollmentOk =
    enrollment.enrolled !== null &&
    enrollment.enrolled.toLowerCase() === expectedDestRouterB32.toLowerCase();

  const report: Record<string, unknown> = {
    destKey,
    warpAsset,
    hubRouter: route.originRouter,
    destRouter: route.destinationRouter,
    hubCollateral: route.token,
    hubMailboxFromSnapshot: route.originMailbox,
    destMailboxFromSnapshot: route.destinationMailbox,
    destinationDomain: route.destinationDomain,
    enrollment: {
      readVia: enrollment.tried,
      onChainBytes32: enrollment.enrolled,
      expectedBytes32: expectedDestRouterB32,
      enrollmentMatchesSnapshot: enrollmentOk,
    },
    quoteTransferRemote: quotes,
    routerMeta: { owner, routerMailbox, hook },
    recipient,
    issues: [] as string[],
  };

  const issues = report.issues as string[];
  if (!enrollmentOk) {
    issues.push(
      "Warp routers not enrolled (or mismatch): run `hyperlane warp deploy` enrollment step or enrollRemoteRouter on hub router for this domain.",
    );
  }
  if (routerMailbox && routerMailbox.toLowerCase() !== route.originMailbox.toLowerCase()) {
    issues.push(`Router mailbox ${routerMailbox} != snapshot ${route.originMailbox}`);
  }

  const kiteTx = process.env.KITE_WARP_TX?.trim();
  if (kiteTx) {
    const msgId = await messageIdFromTxHash(ethers.provider, kiteTx);
    report.dispatchTx = kiteTx;
    report.messageId = msgId ?? null;
    if (msgId) {
      const head = await destProvider.getBlockNumber();
      const from = Math.max(0, head - 20_000);
      const proc = await isMessageProcessedOnDest(route.destinationMailbox, msgId, destProvider, from);
      report.destinationProcess = proc;
      if (!proc.found) {
        issues.push(
          "Message dispatched on Kite but no Mailbox.Process on destination in last ~50k blocks — delivery/relayer/ISM not completed (ORCA scripts only dispatch; something must process on Sepolia).",
        );
      }
    }
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(report, null, 2));
  if (issues.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
