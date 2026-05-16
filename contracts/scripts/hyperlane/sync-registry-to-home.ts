/**
 * Copy ORCA `hyperlane/chains/*` into `~/.hyperlane/chains/*` so Hyperlane CLI can relay kitetestnet.
 *
 *   pnpm exec hardhat run scripts/hyperlane/sync-registry-to-home.ts --network kiteTestnet
 */
import fs from "node:fs";
import path from "node:path";

const REPO_CHAINS = path.resolve(__dirname, "..", "..", "..", "hyperlane", "chains");
const HOME = path.join(process.env.USERPROFILE || process.env.HOME || "", ".hyperlane", "chains");

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(REPO_CHAINS)) {
    throw new Error(`Missing ${REPO_CHAINS}`);
  }
  fs.mkdirSync(HOME, { recursive: true });
  for (const chain of fs.readdirSync(REPO_CHAINS)) {
    const src = path.join(REPO_CHAINS, chain);
    if (!fs.statSync(src).isDirectory()) continue;
    const dest = path.join(HOME, chain);
    copyDir(src, dest);
    // eslint-disable-next-line no-console -- CLI
    console.log("synced", chain, "->", dest);
  }
}

main();
