/**
 * Raise SpendingRuleEnforcer limits on an existing deployment (owner-only configureRule).
 *
 * Aligns on-chain maxPerTx / budget with agents/.env 18-decimal suggested amounts, e.g.:
 *   SCOUT_MAX_SUGGESTED_AMOUNT=200000000000000000  -> DEFAULT_MAX_PER_TX_USDC >= that value
 *
 * Usage (contracts/):
 *   # Set DEPLOYER_PRIVATE_KEY (deployment owner) in contracts/.env
 *   pnpm enforcer:configure-rules
 *
 * Env (optional overrides):
 *   DEFAULT_SPENDING_WINDOW_SECONDS=86400
 *   DEFAULT_SPENDING_BUDGET_USDC=5000000000000000000000
 *   DEFAULT_MAX_PER_TX_USDC=500000000000000000000
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

  const spendingWindow = BigInt(process.env.DEFAULT_SPENDING_WINDOW_SECONDS ?? "86400");
  const spendingBudget = BigInt(process.env.DEFAULT_SPENDING_BUDGET_USDC ?? "5000000000000000000000");
  const spendingMaxPerTx = BigInt(process.env.DEFAULT_MAX_PER_TX_USDC ?? "500000000000000000000");

  if (spendingMaxPerTx <= 0n || spendingBudget <= 0n || spendingWindow <= 0n) {
    throw new Error("Spending rule values must be positive");
  }
  if (spendingMaxPerTx > spendingBudget) {
    throw new Error(
      `DEFAULT_MAX_PER_TX_USDC (${spendingMaxPerTx}) must be <= DEFAULT_SPENDING_BUDGET_USDC (${spendingBudget})`,
    );
  }

  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    network: string;
    owner: string;
    configs: Record<string, unknown>;
    contracts: { SpendingRuleEnforcer: string; ORCAOApp: string };
  };

  const enforcerAddr = artifact.contracts.SpendingRuleEnforcer;
  const oappAddr = artifact.contracts.ORCAOApp;
  const enforcer = await ethers.getContractAt("SpendingRuleEnforcer", enforcerAddr, signer);

  if (signer.address.toLowerCase() !== artifact.owner.toLowerCase()) {
    console.warn(
      `WARNING: signer ${signer.address} is not deployment owner ${artifact.owner}; configureRule may revert.`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  console.log(`Network: ${network.name}`);
  console.log(`Enforcer: ${enforcerAddr}`);
  console.log("New rule:", {
    timeWindow: spendingWindow.toString(),
    budget: spendingBudget.toString(),
    maxPerTx: spendingMaxPerTx.toString(),
    initialWindowStartTime: now,
  });

  const tx = await enforcer.configureRule(spendingWindow, spendingBudget, spendingMaxPerTx, now);
  await tx.wait();
  console.log("configureRule tx:", tx.hash);

  const wl = await enforcer.whitelistedProviders(oappAddr);
  if (!wl) {
    console.log("Whitelisting ORCAOApp:", oappAddr);
    await (await enforcer.setProviderWhitelist(oappAddr, true)).wait();
  } else {
    console.log("ORCAOApp already whitelisted:", oappAddr);
  }

  const rule = await enforcer.rule();
  console.log("On-chain rule now:", {
    timeWindow: rule.timeWindow.toString(),
    budget: rule.budget.toString(),
    maxPerTx: rule.maxPerTx.toString(),
  });

  artifact.configs = {
    ...artifact.configs,
    spendingWindow: spendingWindow.toString(),
    spendingBudget: spendingBudget.toString(),
    spendingMaxPerTx: spendingMaxPerTx.toString(),
  };
  fs.writeFileSync(latestPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log("Updated artifact:", latestPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
