/**
 * Point a destination warp router at NoopISM so in-repo relayer can deliver (testnet only).
 *
 *   pnpm hyperlane:set-warp-noop-ism --network baseSepolia
 *
 * Env: HYP_DEST=basesepolia, HYP_WARP_ASSET=USDT, NOOP_ISM=<optional existing>
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers, network } from "hardhat";
import { getRoute, loadSnapshot } from "./types";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const ROUTER_ABI = [
  "function owner() view returns (address)",
  "function interchainSecurityModule() view returns (address)",
  "function setInterchainSecurityModule(address _module) external",
];

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "basesepolia").toLowerCase();
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  const route = getRoute(loadSnapshot(), destKey, warpAsset);

  const [signer] = await ethers.getSigners();
  const router = new ethers.Contract(route.destinationRouter, ROUTER_ABI, signer);

  const owner = await router.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not router owner ${owner}`);
  }

  let noop = process.env.NOOP_ISM?.trim();
  if (!noop) {
    const spokePath = path.join(ROOT, "deployments", `${network.name}.spoke.json`);
    try {
      const spoke = JSON.parse(fs.readFileSync(spokePath, "utf8")) as {
        contracts: { NoopISM: string };
      };
      noop = spoke.contracts.NoopISM;
    } catch {
      const deployed = await ethers.deployContract("NoopISM");
      await deployed.waitForDeployment();
      noop = await deployed.getAddress();
    }
  }
  noop = ethers.getAddress(noop);

  const before = await router.interchainSecurityModule();
  if (before.toLowerCase() === noop.toLowerCase()) {
    // eslint-disable-next-line no-console -- CLI
    console.log(JSON.stringify({ ok: true, router: route.destinationRouter, ism: noop, alreadySet: true }, null, 2));
    return;
  }

  const tx = await router.setInterchainSecurityModule(noop);
  await tx.wait();
  const after = await router.interchainSecurityModule();

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        ok: after.toLowerCase() === noop.toLowerCase(),
        network: network.name,
        router: route.destinationRouter,
        ismBefore: before,
        ismAfter: after,
        txHash: tx.hash,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
