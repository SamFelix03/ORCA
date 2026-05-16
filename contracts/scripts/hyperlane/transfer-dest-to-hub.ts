import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { transferRemote } from "./warp";

/**
 * Run with destination Hardhat network, e.g.:
 *   HYP_DEST=basesepolia AMOUNT=... npx hardhat run scripts/hyperlane/transfer-dest-to-hub.ts --network baseSepolia
 */
export async function runTransferDestToHub(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "basesepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  const amountRaw = process.env.AMOUNT?.trim() ?? "";
  if (!amountRaw) {
    throw new Error("Set AMOUNT (base units) for the warp transfer.");
  }
  const amount = BigInt(amountRaw);
  if (amount <= 0n) {
    throw new Error("AMOUNT must be > 0");
  }

  const interchainGasWei = BigInt(process.env.INTERCHAIN_GAS_WEI?.trim() ?? "0");

  const { txHash } = await transferRemote({
    signer,
    router: route.destinationRouter,
    destinationDomain: route.originDomain,
    recipient,
    amount,
    interchainGasWei,
  });

  // eslint-disable-next-line no-console -- CLI script
  console.log(
    JSON.stringify(
      {
        direction: "destination_to_hub",
        destKey,
        recipient,
        amount: amount.toString(),
        router: route.destinationRouter,
        destinationDomain: route.originDomain,
        txHash,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  await runTransferDestToHub();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
