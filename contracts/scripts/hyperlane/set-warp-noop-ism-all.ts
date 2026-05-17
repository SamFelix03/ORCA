/**
 * Set NoopISM on USDT warp routers for sepolia, arbitrum, optimism, base (each --network).
 *
 *   pnpm hyperlane:set-warp-noop-ism:all
 */
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const NETWORKS = [
  { network: "sepolia", destKey: "sepolia" },
  { network: "arbitrumSepolia", destKey: "arbitrumsepolia" },
  { network: "optimismSepolia", destKey: "optimismsepolia" },
  { network: "baseSepolia", destKey: "basesepolia" },
];

async function main(): Promise<void> {
  for (const { network, destKey } of NETWORKS) {
    // eslint-disable-next-line no-console -- CLI
    console.log(`\n=== set-warp-noop-ism: ${network} ===\n`);
    execSync(`pnpm exec hardhat run scripts/hyperlane/set-warp-noop-ism.ts --network ${network}`, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, HYP_DEST: destKey, HYP_WARP_ASSET: process.env.HYP_WARP_ASSET ?? "USDT" },
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
