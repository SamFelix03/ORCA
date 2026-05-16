import hre, { ethers } from "hardhat";
import { getRoute, loadSnapshot } from "./types";
import { getRpcUrl, hardhatNetworkForDestKey, hubHardhatNetwork } from "./providers";
import { erc20Balance, routerToken } from "./warp";

function requirePrivateKeyForAddress(): string {
  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY for the holder address used on all chains.");
  }
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  return new ethers.Wallet(hex).address;
}

export async function runPrintBalances(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "basesepolia").toLowerCase();
  const snapshot = loadSnapshot();
  const route = getRoute(snapshot, destKey);

  const hubNet = hubHardhatNetwork(hre);
  const destNet = hardhatNetworkForDestKey(destKey);

  const hubRpc = getRpcUrl(hre, hubNet);
  const destRpc = getRpcUrl(hre, destNet);

  const hubProvider = new ethers.JsonRpcProvider(hubRpc);
  const destProvider = new ethers.JsonRpcProvider(destRpc);

  const recipient = process.env.RECIPIENT?.trim()
    ? ethers.getAddress(process.env.RECIPIENT.trim())
    : requirePrivateKeyForAddress();

  const hubToken = ethers.getAddress(route.token);
  const destToken = await routerToken(route.destinationRouter, destProvider);

  const hubBal = await erc20Balance(hubToken, recipient, hubProvider);
  const destBal = await erc20Balance(destToken, recipient, destProvider);

  const hubChainId = (await hubProvider.getNetwork()).chainId;
  const destChainId = (await destProvider.getNetwork()).chainId;

  // eslint-disable-next-line no-console -- CLI script
  console.log(
    JSON.stringify(
      {
        destKey,
        recipient,
        hub: {
          hardhatNetwork: hubNet,
          chainId: hubChainId.toString(),
          token: hubToken,
          balance: hubBal.toString(),
        },
        destination: {
          hardhatNetwork: destNet,
          chainId: destChainId.toString(),
          token: destToken,
          balance: destBal.toString(),
        },
        route: {
          originRouter: route.originRouter,
          destinationRouter: route.destinationRouter,
          originDomain: route.originDomain,
          destinationDomain: route.destinationDomain,
        },
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  await runPrintBalances();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
