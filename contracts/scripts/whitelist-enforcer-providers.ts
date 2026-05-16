/**
 * Fix EnforcerRejected (0x458bae4d): whitelist ORCAOApp on SpendingRuleEnforcer.
 * Cross-chain flows call ClientAgentVault.execute(target = ORCAOApp, ...); the enforcer
 * only allows whitelisted provider addresses.
 *
 * Usage (contracts/):
 *   export PRIVATE_KEY=0x...   # must be enforcer owner (deployment INITIAL_OWNER)
 *   pnpm exec hardhat run scripts/whitelist-enforcer-providers.ts --network kiteTestnet
 */
import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const [signer] = await ethers.getSigners();
  const root = path.resolve(__dirname, "..");
  const latestPath = path.join(root, "deployments", "kite-testnet.latest.json");
  if (!fs.existsSync(latestPath)) {
    throw new Error(`Missing deployment artifact: ${latestPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    network: string;
    owner: string;
    contracts: { SpendingRuleEnforcer: string; ORCAOApp: string };
  };

  if (artifact.network && network.name && artifact.network !== network.name) {
    console.warn(
      `Warning: artifact network ${artifact.network} may not match Hardhat network ${network.name}`,
    );
  }

  const enforcerAddr = artifact.contracts.SpendingRuleEnforcer;
  const oappAddr = artifact.contracts.ORCAOApp;
  const enforcer = await ethers.getContractAt("SpendingRuleEnforcer", enforcerAddr, signer);

  if (signer.address.toLowerCase() !== artifact.owner.toLowerCase()) {
    console.warn(
      `WARNING: signer ${signer.address} is not deployment owner ${artifact.owner}; setProviderWhitelist may revert.`,
    );
  }

  console.log(`Network: ${network.name}`);
  console.log(`Enforcer: ${enforcerAddr}`);
  console.log(`Whitelisting ORCAOApp: ${oappAddr}`);
  await (await enforcer.setProviderWhitelist(oappAddr, true)).wait();
  console.log("OK: ORCAOApp is whitelisted (cross-chain vault.execute should pass enforcer).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
