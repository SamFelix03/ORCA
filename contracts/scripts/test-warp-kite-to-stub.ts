/**
 * E2E: Kite warp USDT → destination morpho stub, syncWarpedDeposit, verify principal.
 *
 * Start relayer first:  cd contracts && pnpm relayer:start
 *
 *   HYP_DEST=sepolia pnpm test:warp-kite-stub
 *   pnpm test:warp-kite-spokes   # sepolia + arbitrum + optimism (skips base)
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import hre from "hardhat";
import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./hyperlane/types";
import { getRpcUrl, hardhatNetworkForDestKey } from "./hyperlane/providers";
import { erc20Balance, routerToken, transferRemote } from "./hyperlane/warp";
import {
  attemptHyperlaneRelay,
  DEST_KEY_TO_HYP_CHAIN,
  isMessageProcessedOnDest,
  messageIdFromReceipt,
} from "./hyperlane/delivery";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const DEST_KEY_TO_SPOKE_FILE: Record<string, string> = {
  sepolia: "sepolia.spoke.json",
  arbitrumsepolia: "arbitrumSepolia.spoke.json",
  optimismsepolia: "optimismSepolia.spoke.json",
  basesepolia: "baseSepolia.spoke.json",
};

const STUB_ABI = [
  "function syncWarpedDeposit() external",
  "function principalOf(address) view returns (uint256)",
  "function accountedUnderlying() view returns (uint256)",
  "function underlying() view returns (address)",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runWarpKiteToStubTest(destKey: string): Promise<boolean> {
  const key = destKey.toLowerCase();
  const spokeFile = DEST_KEY_TO_SPOKE_FILE[key];
  if (!spokeFile) {
    throw new Error(`Unknown HYP_DEST ${destKey}`);
  }

  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const amount = BigInt(process.env.AMOUNT?.trim() ?? "100000000000000000");
  const pollSec = Number(process.env.BRIDGE_POLL_SEC ?? "300");
  const pollMs = Number(process.env.BRIDGE_POLL_INTERVAL_MS ?? "8000");
  const skipWarp = process.env.SKIP_WARP === "1";
  const attemptRelay = process.env.ATTEMPT_RELAY === "1";

  const spokePath = path.join(ROOT, "deployments", spokeFile);
  const spoke = JSON.parse(fs.readFileSync(spokePath, "utf8")) as {
    contracts: { OrcaMorphoBlueStubVault: string };
    underlying: { address: string };
    network: string;
  };
  const stub = ethers.getAddress(spoke.contracts.OrcaMorphoBlueStubVault);
  const underlying = ethers.getAddress(spoke.underlying.address);

  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, key, warpAsset);
  const destNet = hardhatNetworkForDestKey(key);
  const destRpc = getRpcUrl(hre, destNet);
  const destProvider = new ethers.JsonRpcProvider(destRpc);

  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("Set PRIVATE_KEY in contracts/.env");

  const destWallet = new ethers.Wallet(pk, destProvider);
  const stubContract = new ethers.Contract(stub, STUB_ABI, destWallet);

  let txHash: string | undefined;
  let messageId: string | undefined;
  let balBefore = await erc20Balance(underlying, stub, destProvider);
  const principalBefore = (await stubContract.principalOf(stub)) as bigint;

  if (!skipWarp) {
    const [signer] = await ethers.getSigners();
    const destToken = await routerToken(route.destinationRouter, destProvider);
    balBefore = await erc20Balance(destToken, stub, destProvider);

    // eslint-disable-next-line no-console -- CLI
    console.log(`\n=== ${key} transferRemote → stub ===`, { stub, amount: amount.toString() });
    const sent = await transferRemote({
      signer,
      router: route.originRouter,
      destinationDomain: route.destinationDomain,
      recipient: stub,
      amount,
      interchainGasWei: BigInt(process.env.INTERCHAIN_GAS_WEI?.trim() ?? "0"),
    });
    txHash = sent.txHash;
    const receipt = await ethers.provider.getTransactionReceipt(txHash);
    messageId = receipt ? messageIdFromReceipt(receipt) : undefined;

    const headAtStart = await destProvider.getBlockNumber();
    const fromBlock = Math.max(0, headAtStart - 5);
    const deadline = Date.now() + pollSec * 1000;
    let balAfter = balBefore;
    let processFound = false;

    while (Date.now() < deadline) {
      await sleep(pollMs);
      balAfter = await erc20Balance(destToken, stub, destProvider);
      if (messageId) {
        const proc = await isMessageProcessedOnDest(
          route.destinationMailbox,
          messageId,
          destProvider,
          fromBlock,
        );
        processFound = proc.found;
      }
      // eslint-disable-next-line no-console -- CLI
      console.log(`[${key}] poll… stubBal=${balAfter.toString()} delta=${(balAfter - balBefore).toString()}`);
      if (balAfter > balBefore || processFound) break;
    }

    if (!processFound && balAfter <= balBefore && messageId && attemptRelay) {
      const hypDest = DEST_KEY_TO_HYP_CHAIN[key] ?? key;
      attemptHyperlaneRelay({
        privateKey: pk,
        destinationChain: hypDest,
        messageId,
        dispatchTx: txHash,
        timeoutSec: Number(process.env.RELAY_TIMEOUT_SEC ?? "180"),
      });
      balAfter = await erc20Balance(destToken, stub, destProvider);
    }

    if (balAfter <= balBefore) {
      throw new Error(
        `[${key}] Warp did not credit stub. Run pnpm relayer:start and wait for [delivered] ${spoke.network}.`,
      );
    }
  }

  const balOnStub = await erc20Balance(underlying, stub, destProvider);
  let accountedBefore = (await stubContract.accountedUnderlying()) as bigint;
  let principalAfter = (await stubContract.principalOf(stub)) as bigint;
  let syncTxHash: string | undefined;

  if (balOnStub > accountedBefore) {
    // eslint-disable-next-line no-console -- CLI
    console.log(`[${key}] syncWarpedDeposit`);
    const syncTx = await stubContract.syncWarpedDeposit();
    const syncReceipt = await syncTx.wait();
    syncTxHash = syncTx.hash;
    if (!syncReceipt || syncReceipt.status !== 1) {
      throw new Error(`[${key}] syncWarpedDeposit reverted: ${syncTx.hash}`);
    }
    principalAfter = (await stubContract.principalOf(stub)) as bigint;
  } else {
    // eslint-disable-next-line no-console -- CLI
    console.log(`[${key}] syncWarpedDeposit skipped (already accounted)`);
  }

  const accountedAfter = (await stubContract.accountedUnderlying()) as bigint;
  const ok =
    balOnStub > 0n &&
    principalAfter > 0n &&
    accountedAfter >= balOnStub &&
    principalAfter >= accountedAfter;

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        destKey: key,
        ok,
        stub,
        txHash,
        messageId,
        balOnStub: balOnStub.toString(),
        principalBefore: principalBefore.toString(),
        principalAfter: principalAfter.toString(),
        accountedAfter: accountedAfter.toString(),
        syncTx: syncTxHash ?? null,
      },
      null,
      2,
    ),
  );
  return ok;
}

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "basesepolia").toLowerCase();
  const ok = await runWarpKiteToStubTest(destKey);
  process.exitCode = ok ? 0 : 2;
}

const invokedDirectly = process.argv[1]?.includes("test-warp-kite-to-stub");
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
