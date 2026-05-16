import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const latestPath = path.join(root, "deployments", "kite-testnet.latest.json");
  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    contracts: {
      ClientAgentVault: string;
      SpendingRuleEnforcer: string;
      ORCAOApp: string;
    };
  };

  const vaultAddr = artifact.contracts.ClientAgentVault;
  const oappAddr = artifact.contracts.ORCAOApp;
  const enforcerAddrArtifact = artifact.contracts.SpendingRuleEnforcer;

  const provider = ethers.provider;
  const vault = await ethers.getContractAt("ClientAgentVault", vaultAddr, provider);
  const onChainEnforcer = await vault.enforcer();
  const vaultExecutor = await vault.executor();
  const enforcer = await ethers.getContractAt("SpendingRuleEnforcer", onChainEnforcer, provider);

  const [owner] = await ethers.getSigners();
  console.log("Network:", network.name);
  console.log("Signer (may be unrelated):", owner.address);
  console.log("ClientAgentVault:", vaultAddr);
  console.log("Vault.executor (must match EXECUTOR_PRIVATE_KEY):", vaultExecutor);
  console.log("Vault.enforcer (on-chain):", onChainEnforcer);
  console.log("Artifact enforcer (expected same):", enforcerAddrArtifact);
  console.log("Match:", onChainEnforcer.toLowerCase() === enforcerAddrArtifact.toLowerCase());

  const wl = await enforcer.whitelistedProviders(oappAddr);
  console.log("ORCAOApp whitelisted:", oappAddr, "=>", wl);

  const rule = await enforcer.rule();
  console.log("Rule:", {
    timeWindow: rule.timeWindow.toString(),
    budget: rule.budget.toString(),
    maxPerTx: rule.maxPerTx.toString(),
  });
  const pausedUntil = await enforcer.pausedUntil();
  const now = Math.floor(Date.now() / 1000);
  console.log("pausedUntil:", pausedUntil.toString(), "now:", now, "paused:", pausedUntil > BigInt(now));
  const spent = await enforcer.spentInWindow();
  console.log("spentInWindow:", spent.toString());

  for (const amount of [10_000n, 50_000n, 500_000_000n]) {
    const ok = await enforcer.enforceRules(oappAddr, amount);
    const projected = spent + amount;
    console.log(`enforceRules(OApp, ${amount}):`, ok, `(spent+amount=${projected}, budget=${rule.budget.toString()})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
