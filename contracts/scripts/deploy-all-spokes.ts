/**
 * Deploy ORCA spokes (NoopISM + RemoteAdapter + stubs) on all four testnet destinations.
 *
 *   cd contracts && pnpm deploy:spokes:all
 *
 * Requires DEPLOYER_PRIVATE_KEY / PRIVATE_KEY and native gas on each chain.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

type Manifest = {
  collateralTokenByChainId: Record<string, string>;
};

const SPOKES: Array<{
  network: string;
  chainId: number;
  mailboxEnv: string;
}> = [
  { network: "sepolia", chainId: 11155111, mailboxEnv: "HYP_MAILBOX_SEPOLIA" },
  { network: "arbitrumSepolia", chainId: 421614, mailboxEnv: "HYP_MAILBOX_ARBITRUM_SEPOLIA" },
  { network: "optimismSepolia", chainId: 11155420, mailboxEnv: "HYP_MAILBOX_OPTIMISM_SEPOLIA" },
  { network: "baseSepolia", chainId: 84532, mailboxEnv: "HYP_MAILBOX_BASE_SEPOLIA" },
];

async function main(): Promise<void> {
  const manifestPath = path.join(ROOT, "config", "orca-collateral.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

  for (const spoke of SPOKES) {
    const underlying = manifest.collateralTokenByChainId[String(spoke.chainId)];
    const mailbox = process.env[spoke.mailboxEnv]?.trim();
    if (!underlying) {
      throw new Error(`manifest missing collateral for chainId ${spoke.chainId}`);
    }
    if (!mailbox) {
      throw new Error(`Set ${spoke.mailboxEnv} in contracts/.env`);
    }

    // eslint-disable-next-line no-console -- CLI
    console.log(`\n=== deploy-spoke: ${spoke.network} (${spoke.chainId}) ===\n`);
    try {
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
    } catch (e) {
      // eslint-disable-next-line no-console -- CLI
      console.error(`deploy-spoke failed for ${spoke.network}:`, (e as Error).message);
      if (process.env.DEPLOY_SPOKES_CONTINUE !== "1") {
        throw e;
      }
    }
    const pauseMs = Number(process.env.DEPLOY_SPOKE_PAUSE_MS ?? "10000");
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("\nSpoke deploy pass complete. Run: pnpm hyperlane:wire-trust && pnpm sync:spoke-config");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
