/**
 * Read-only balance probe + optional tiny USDT HypCollateral transfer Kite → each spoke.
 *
 *   cd contracts
 *   pnpm hyperlane:smoke-bridge-all                    # balances + transfer if hub USDT >= AMOUNT
 *   SMOKE_BRIDGE_DRY_RUN=1 pnpm hyperlane:smoke-bridge-all   # balances only
 *
 * Env: HYP_WARP_ASSET (default USDT), RECIPIENT, AMOUNT (wei, default 1e15),
 * INTERCHAIN_GAS_WEI, BRIDGE_POLL_MS (default 15000), BRIDGE_POLL_ROUNDS (default 8).
 */
import hre, { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { getRpcUrl, hardhatNetworkForDestKey, hubHardhatNetwork } from "./providers";
import { erc20Balance, routerToken, transferRemote } from "./warp";

const DEST_KEYS = ["sepolia", "arbitrumsepolia", "optimismsepolia", "basesepolia"] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const snapshot = loadSnapshot();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  const amountStr = process.env.AMOUNT?.trim() ?? "1000000000000000";
  const amount = BigInt(amountStr);
  const dryRun = process.env.SMOKE_BRIDGE_DRY_RUN === "1";
  const gasWei = BigInt(process.env.INTERCHAIN_GAS_WEI?.trim() ?? "0");
  const pollMs = Number(process.env.BRIDGE_POLL_MS ?? "15000");
  const pollRounds = Number(process.env.BRIDGE_POLL_ROUNDS ?? "8");

  const hubNet = hubHardhatNetwork(hre);
  const hubRpc = getRpcUrl(hre, hubNet);
  const hubProvider = new ethers.JsonRpcProvider(hubRpc);

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      { hubNetwork: hubNet, warpAsset, recipient, amount: amount.toString(), dryRun },
      null,
      2,
    ),
  );

  for (const destKey of DEST_KEYS) {
    const route = getRoute(snapshot, destKey, warpAsset);
    const destNet = hardhatNetworkForDestKey(destKey);
    const destRpc = getRpcUrl(hre, destNet);
    const destProvider = new ethers.JsonRpcProvider(destRpc);

    const hubToken = ethers.getAddress(route.token);
    const destToken = await routerToken(route.destinationRouter, destProvider);

    const hubBal = await erc20Balance(hubToken, recipient, hubProvider);
    const destBefore = await erc20Balance(destToken, recipient, destProvider);

    // eslint-disable-next-line no-console -- CLI
    console.log(
      "\n--- " +
        destKey +
        " ---\n" +
        JSON.stringify(
          {
            destNetwork: destNet,
            originRouter: route.originRouter,
            destinationRouter: route.destinationRouter,
            hubCollateralToken: hubToken,
            destSyntheticToken: destToken,
            hubBal: hubBal.toString(),
            destBalBefore: destBefore.toString(),
          },
          null,
          2,
        ),
    );

    if (dryRun) {
      continue;
    }

    if (hubBal < amount) {
      // eslint-disable-next-line no-console -- CLI
      console.warn(`Skip transfer: hub balance ${hubBal} < AMOUNT ${amount}`);
      continue;
    }

    // eslint-disable-next-line no-console -- CLI
    console.log(`Submitting transferRemote → ${destKey}…`);
    const { txHash } = await transferRemote({
      signer,
      router: route.originRouter,
      destinationDomain: route.destinationDomain,
      recipient,
      amount,
      interchainGasWei: gasWei,
    });

    // eslint-disable-next-line no-console -- CLI
    console.log("Hub tx:", txHash);

    let destAfter = destBefore;
    for (let i = 0; i < pollRounds; i++) {
      await sleep(pollMs);
      destAfter = await erc20Balance(destToken, recipient, destProvider);
      if (destAfter > destBefore) {
        break;
      }
    }

    // eslint-disable-next-line no-console -- CLI
    console.log(
      JSON.stringify(
        {
          destKey,
          destBalAfter: destAfter.toString(),
          delta: (destAfter - destBefore).toString(),
          relayed: destAfter > destBefore,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
