/**
 * For ORCA Sepolia RemoteAdapter.handle(): the beneficiary must hold spoke synthetic USDT (e.g. 0x9EC2…)
 * and approve RemoteAdapter to pull it. The hub vault address usually has NO code on Sepolia,
 * so use the owner EOA (default 0x2514…) as spoke beneficiary — see E2E_SPOKE_BENEFICIARY + e2e script.
 *
 * 1) Hub → Sepolia: warp **faucet USDT** on Kite (`0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` per snapshot;
 *    HypCollateral routers). **PIEUSD is not used here** — that token is marketplace / x402 payments only.
 * 2) Sepolia: approve(RemoteAdapter, type(uint256).max) on spoke USDT.
 *
 *   cd contracts
 *   pnpm prepare:sepolia-e2e
 *
 * Env: PRIVATE_KEY / DEPLOYER_PRIVATE_KEY (vault executor; must hold hub USDT 0x0fF539… for `transferRemote`).
 * Optional: WARP_AMOUNT (wei, default 1e18), BENEFICIARY, HYP_WARP_ASSET (default USDT).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { ethers } from "hardhat";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function main(): Promise<void> {
  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const [signer] = await ethers.getSigners();
  const beneficiary = process.env.BENEFICIARY?.trim()
    ? ethers.getAddress(process.env.BENEFICIARY.trim())
    : signer.address;

  const warpAmount = process.env.WARP_AMOUNT?.trim() ?? "1000000000000000000";

  const spoke = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "sepolia.spoke.json"), "utf8")) as {
    contracts: { RemoteAdapter: string };
    underlying: { address: string };
  };
  const adapter = ethers.getAddress(spoke.contracts.RemoteAdapter);
  const usdt = ethers.getAddress(spoke.underlying.address);

  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();
  // eslint-disable-next-line no-console -- CLI
  console.log(`--- 1) Hub warp ${warpAsset} (Kite USDT collateral) → Sepolia (recipient = beneficiary) ---`);
  execSync("pnpm exec hardhat run scripts/hyperlane/transfer-hub-to-dest.ts --network kiteTestnet", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      HYP_DEST: "sepolia",
      HYP_WARP_ASSET: warpAsset,
      RECIPIENT: beneficiary,
      AMOUNT: warpAmount,
    },
  });

  // eslint-disable-next-line no-console -- CLI
  console.log("--- 2) Sepolia: approve USDT for RemoteAdapter ---");
  const erc20 = await ethers.getContractAt(
    ["function approve(address spender, uint256 amount) external returns (bool)", "function allowance(address,address) view returns (uint256)"],
    usdt,
    signer,
  );
  const tx = await erc20.approve(adapter, ethers.MaxUint256);
  await tx.wait();
  const allow = await erc20.allowance(signer.address, adapter);
  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify({ beneficiary, usdt, remoteAdapter: adapter, allowance: allow.toString() }, null, 2));
  // eslint-disable-next-line no-console -- CLI
  console.log("OK. Run e2e with E2E_SPOKE_BENEFICIARY=" + beneficiary + " (or set hub owner as beneficiary in e2e defaults).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
