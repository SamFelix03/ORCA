/**
 * Redeploy spokes on sepolia, arbitrumSepolia, optimismSepolia (skip base).
 *
 *   pnpm deploy:spokes:remaining
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const SPOKES = [
  { network: "sepolia", chainId: 11155111, mailboxEnv: "HYP_MAILBOX_SEPOLIA" },
  { network: "arbitrumSepolia", chainId: 421614, mailboxEnv: "HYP_MAILBOX_ARBITRUM_SEPOLIA" },
  { network: "optimismSepolia", chainId: 11155420, mailboxEnv: "HYP_MAILBOX_OPTIMISM_SEPOLIA" },
];

async function main(): Promise<void> {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config", "orca-collateral.manifest.json"), "utf8"),
  ) as { collateralTokenByChainId: Record<string, string> };

  for (const spoke of SPOKES) {
    const underlying = manifest.collateralTokenByChainId[String(spoke.chainId)];
    const mailbox = process.env[spoke.mailboxEnv]?.trim();
    if (!underlying || !mailbox) {
      throw new Error(`Missing collateral or ${spoke.mailboxEnv}`);
    }
    // eslint-disable-next-line no-console -- CLI
    console.log(`\n=== deploy-spoke: ${spoke.network} ===\n`);
    execSync(`pnpm exec hardhat run scripts/deploy-spoke.ts --network ${spoke.network}`, {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        ORCA_UNDERLYING_TOKEN: underlying,
        ORCA_SPOKE_MAILBOX: mailbox,
        DEPLOY_TX_DELAY_MS: process.env.DEPLOY_TX_DELAY_MS ?? "4000",
      },
    });
  }
  // eslint-disable-next-line no-console -- CLI
  console.log("\nDone. Run: pnpm hyperlane:wire-trust && pnpm sync:spoke-config && pnpm hyperlane:set-warp-noop-ism:all");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
