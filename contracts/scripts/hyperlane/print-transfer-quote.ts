/**
 * Print `quoteTransferRemote` for a hub→dest USDT warp (native + token pull).
 *
 *   cd contracts
 *   HYP_DEST=sepolia pnpm exec hardhat run scripts/hyperlane/print-transfer-quote.ts --network kiteTestnet
 */
import { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";

const ROUTER_ABI = [
  "function quoteTransferRemote(uint32 destination, bytes32 recipient, uint256 amount) view returns (tuple(address token, uint256 amount)[] memory)",
];

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const amount = BigInt(process.env.AMOUNT?.trim() ?? "1000000000000000000");
  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : signer.address;

  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey, warpAsset);
  const r = new ethers.Contract(route.originRouter, ROUTER_ABI, ethers.provider);
  const b32 = ethers.zeroPadValue(recipient, 32);

  try {
    const quotes = (await r.quoteTransferRemote(route.destinationDomain, b32, amount)) as Array<{
      token: string;
      amount: bigint;
    }>;
    // eslint-disable-next-line no-console -- CLI
    console.log(
      JSON.stringify(
        {
          router: route.originRouter,
          destinationDomain: route.destinationDomain,
          amount: amount.toString(),
          recipient,
          quotes: quotes.map((q) => ({
            token: q.token,
            isNativeFee: q.token.toLowerCase() === ethers.ZeroAddress.toLowerCase(),
            amount: q.amount.toString(),
          })),
        },
        null,
        2,
      ),
    );
  } catch (e) {
    // eslint-disable-next-line no-console -- CLI
    console.error("quoteTransferRemote failed (old router ABI or revert):", (e as Error).message);
    process.exitCode = 1;
  }
}

main();
