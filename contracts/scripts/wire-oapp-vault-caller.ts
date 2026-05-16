/**
 * Wire ORCAOApp.executorVault to ClientAgentVault (required for executeCrossChainRebalance).
 * Older deploys set OApp.executorVault to the EOA; the OApp only accepts calls from the vault
 * contract. Otherwise the inner call reverts and ClientAgentVault surfaces ExecutionFailed (0xacfdb444).
 *
 *   pnpm oapp:wire-vault
 */
import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const [owner] = await ethers.getSigners();
  const root = path.resolve(__dirname, "..");
  const latestPath = path.join(root, "deployments", "kite-testnet.latest.json");
  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    contracts: { ORCAOApp: string; ClientAgentVault: string };
  };
  const oappAddr = artifact.contracts.ORCAOApp;
  const vaultAddr = artifact.contracts.ClientAgentVault;
  const oapp = await ethers.getContractAt("ORCAOApp", oappAddr, owner);
  const current = await oapp.executorVault();
  console.log("Network:", network.name);
  console.log("ORCAOApp:", oappAddr);
  console.log("ClientAgentVault:", vaultAddr);
  console.log("Current OApp.executorVault:", current);
  if (current.toLowerCase() === vaultAddr.toLowerCase()) {
    console.log("Already wired.");
    return;
  }
  await (await oapp.setExecutorVault(vaultAddr)).wait();
  console.log("Updated OApp.executorVault to ClientAgentVault.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
