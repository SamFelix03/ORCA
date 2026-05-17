/**
 * Read-only: verify ORCAOApp.executorVault == ClientAgentVault and BridgeGuard authorizes the OApp.
 *
 *   pnpm oapp:diagnose
 */
import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const latestPath = path.join(root, "deployments", "kite-testnet.latest.json");
  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    contracts: { ORCAOApp: string; ClientAgentVault: string };
    configs?: { trustedRemotes?: Array<{ domain: number; remote: string }> };
  };

  const oappAddr = artifact.contracts.ORCAOApp;
  const vaultAddr = artifact.contracts.ClientAgentVault;
  const provider = ethers.provider;

  const oapp = await ethers.getContractAt("ORCAOApp", oappAddr, provider);
  const executorVault = await oapp.executorVault();
  const bridgeGuardAddr = await oapp.bridgeGuard();

  const guard = await ethers.getContractAt("LZBridgeGuard", bridgeGuardAddr, provider);
  const oappAuthorized = await guard.authorizedCallers(oappAddr);
  const guardThreshold = await guard.approvalThresholdUsdc();

  const vault = await ethers.getContractAt("ClientAgentVault", vaultAddr, provider);
  const vaultExecutor = await vault.executor();

  console.log("Network:", network.name);
  console.log("ORCAOApp:", oappAddr);
  console.log("ClientAgentVault:", vaultAddr);
  console.log("OApp.executorVault (on-chain):", executorVault);
  console.log("Wiring OK (vault is executorVault):", executorVault.toLowerCase() === vaultAddr.toLowerCase());
  console.log("Vault.executor (must match EXECUTOR_PRIVATE_KEY):", vaultExecutor);
  console.log("LZBridgeGuard:", bridgeGuardAddr);
  console.log("BridgeGuard approvalThresholdUsdc:", guardThreshold.toString());
  console.log(
    "  (amounts < threshold skip approveTransfer; threshold should exceed SCOUT_MAX_SUGGESTED_AMOUNT for demo)",
  );
  console.log("BridgeGuard authorized OApp caller:", oappAuthorized);

  const remotes = artifact.configs?.trustedRemotes ?? [];
  if (remotes.length > 0) {
    console.log("OApp.trustedRemotes (sample):");
    for (const { domain, remote } of remotes.slice(0, 8)) {
      const onChain = await oapp.trustedRemotes(domain);
      const match = onChain.toLowerCase() === remote.toLowerCase();
      console.log(`  domain ${domain}: artifact=${remote} onChain=${onChain} match=${match}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
