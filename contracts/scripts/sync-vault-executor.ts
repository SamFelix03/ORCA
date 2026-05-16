/**
 * Set ClientAgentVault.executor to match the account your Executor agent uses.
 *
 * Option A — derive from agents/.env:
 *   EXECUTOR_PRIVATE_KEY=0x... (in agents/.env)
 *
 * Option B — explicit address (e.g. all agents share deployer 0x2514...):
 *   SYNC_VAULT_EXECUTOR_TO=0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844 pnpm vault:sync-executor
 *
 * Run from contracts/ with the vault OWNER key:
 *   PRIVATE_KEY=<owner> pnpm exec hardhat run scripts/sync-vault-executor.ts --network kiteTestnet
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const agentsEnv = path.resolve(__dirname, "../../agents/.env");
  if (fs.existsSync(agentsEnv)) {
    dotenv.config({ path: agentsEnv });
  }

  const explicit = process.env.SYNC_VAULT_EXECUTOR_TO?.trim();
  let newExecutor: string;
  if (explicit) {
    if (!ethers.isAddress(explicit)) {
      throw new Error(`SYNC_VAULT_EXECUTOR_TO must be a valid address, got ${explicit}`);
    }
    newExecutor = ethers.getAddress(explicit);
  } else {
    const pk = process.env.EXECUTOR_PRIVATE_KEY?.trim();
    if (!pk) {
      throw new Error("Set SYNC_VAULT_EXECUTOR_TO or EXECUTOR_PRIVATE_KEY (e.g. in agents/.env)");
    }
    newExecutor = new ethers.Wallet(pk).address;
  }

  const root = path.resolve(__dirname, "..");
  const latestPath = path.join(root, "deployments", "kite-testnet.latest.json");
  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    contracts: { ClientAgentVault: string };
  };
  const vaultAddr = artifact.contracts.ClientAgentVault;

  const [owner] = await ethers.getSigners();
  const vault = await ethers.getContractAt("ClientAgentVault", vaultAddr, owner);
  const current = await vault.executor();

  console.log("Network:", network.name);
  console.log("Vault:", vaultAddr);
  console.log("Current vault.executor:", current);
  console.log(
    explicit ? `Target executor (SYNC_VAULT_EXECUTOR_TO): ${newExecutor}` : `EXECUTOR_PRIVATE_KEY address: ${newExecutor}`,
  );

  if (current.toLowerCase() === newExecutor.toLowerCase()) {
    console.log("Already aligned; nothing to do.");
    return;
  }

  const tx = await vault.setExecutor(newExecutor);
  await tx.wait();
  console.log("Updated vault.executor to", newExecutor);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
