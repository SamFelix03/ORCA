import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { transferRemote } from "./warp";

export async function runTransferHubToDest(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "basesepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "PIEUSD").trim();
  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  const amountRaw = process.env.AMOUNT?.trim() ?? "";
  if (!amountRaw) {
    throw new Error("Set AMOUNT (base units, uint256 string) for the warp transfer.");
  }
  const amount = BigInt(amountRaw);
  if (amount <= 0n) {
    throw new Error("AMOUNT must be > 0");
  }

  const interchainGasWei = BigInt(process.env.INTERCHAIN_GAS_WEI?.trim() ?? "0");

  const { txHash } = await transferRemote({
    signer,
    router: route.originRouter,
    destinationDomain: route.destinationDomain,
    recipient,
    amount,
    interchainGasWei,
  });

  // eslint-disable-next-line no-console -- CLI script
  console.log(
    JSON.stringify(
      {
        direction: "hub_to_destination",
        destKey,
        recipient,
        amount: amount.toString(),
        warpAsset,
        originRouter: route.originRouter,
        destinationDomain: route.destinationDomain,
        txHash,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  await runTransferHubToDest();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
