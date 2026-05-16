/**
 * Per-spoke E2E prep: warp USDT from Kite, then approve RemoteAdapter on the spoke.
 *
 *   cd contracts
 *   HYP_DEST=sepolia pnpm prepare:spoke-e2e
 *
 * Env: PRIVATE_KEY / DEPLOYER_PRIVATE_KEY, optional BENEFICIARY, WARP_AMOUNT, HYP_WARP_ASSET (default USDT).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { getRpcUrl } from "./hyperlane/providers";
import hre from "hardhat";
import { hardhatNetworkForDestKey } from "./hyperlane/providers";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main(): Promise<void> {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const network = hardhatNetworkForDestKey(destKey);
  const spokePath = path.join(ROOT, "deployments", `${network}.spoke.json`);
  if (!fs.existsSync(spokePath)) {
    throw new Error(`Missing ${spokePath}; run deploy:spokes:all first`);
  }

  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const beneficiary = process.env.BENEFICIARY?.trim()
    ? ethers.getAddress(process.env.BENEFICIARY.trim())
    : new ethers.Wallet(pk).address;

  const spoke = JSON.parse(fs.readFileSync(spokePath, "utf8")) as {
    contracts: { RemoteAdapter: string };
    underlying: { address: string };
  };
  const adapter = ethers.getAddress(spoke.contracts.RemoteAdapter);
  const usdt = ethers.getAddress(spoke.underlying.address);
  const warpAmount = process.env.WARP_AMOUNT?.trim() ?? "1000000000000000000";
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();

  // eslint-disable-next-line no-console -- CLI
  console.log(`--- 1) Hub warp ${warpAsset} → ${destKey} ---`);
  execSync("pnpm exec hardhat run scripts/hyperlane/transfer-hub-to-dest.ts --network kiteTestnet", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      HYP_DEST: destKey,
      HYP_WARP_ASSET: warpAsset,
      RECIPIENT: beneficiary,
      AMOUNT: warpAmount,
    },
  });

  if (process.env.SKIP_RELAY !== "1") {
    // eslint-disable-next-line no-console -- CLI
    console.log("--- 1b) ORCA relayer (warp delivery) ---");
    execSync("pnpm relayer:once", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env },
    });
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(`--- 2) ${destKey}: approve USDT for RemoteAdapter ---`);
  const destRpc = getRpcUrl(hre, network);
  const wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(destRpc));
  const erc20 = new ethers.Contract(
    usdt,
    [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address,address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
    ],
    wallet,
  );
  const tx = await erc20.approve(adapter, ethers.MaxUint256);
  await tx.wait();
  const allow = await erc20.allowance(wallet.address, adapter);
  const bal = await erc20.balanceOf(wallet.address);
  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      { destKey, beneficiary, usdt, remoteAdapter: adapter, balance: bal.toString(), allowance: allow.toString() },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
