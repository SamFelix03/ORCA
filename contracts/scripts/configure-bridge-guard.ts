/**
 * Raise LZBridgeGuard.approvalThresholdUsdc so demo/hackathon amounts skip multisig pre-approval.
 *
 * ORCAOApp builds transferId with block.timestamp, so off-chain approveTransfer(transferId)
 * cannot be done reliably before vault.execute. For amounts below the threshold,
 * requireApproval() is a no-op.
 *
 * Usage (contracts/):
 *   BRIDGE_GUARD_THRESHOLD_USDC=50000000000000000000000  # > SCOUT_MAX_SUGGESTED_AMOUNT
 *   pnpm bridge-guard:configure-threshold
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

  const newThreshold = BigInt(process.env.BRIDGE_GUARD_THRESHOLD_USDC ?? "50000000000000000000000");
  if (newThreshold <= 0n) {
    throw new Error("BRIDGE_GUARD_THRESHOLD_USDC must be positive");
  }

  const artifact = JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
    owner: string;
    configs: Record<string, unknown>;
    contracts: { LZBridgeGuard: string; ORCAOApp: string };
  };

  const guardAddr = artifact.contracts.LZBridgeGuard;
  const oappAddr = artifact.contracts.ORCAOApp;
  const guard = await ethers.getContractAt("LZBridgeGuard", guardAddr, signer);

  if (signer.address.toLowerCase() !== artifact.owner.toLowerCase()) {
    console.warn(
      `WARNING: signer ${signer.address} is not deployment owner ${artifact.owner}; setApprovalThresholdUsdc may revert.`,
    );
  }

  const prev = await guard.approvalThresholdUsdc();
  console.log(`Network: ${network.name}`);
  console.log(`LZBridgeGuard: ${guardAddr}`);
  console.log(`Previous threshold: ${prev.toString()}`);
  console.log(`New threshold:      ${newThreshold.toString()}`);
  console.log(
    "Transfers with amount < threshold skip pre-approval (recommended: threshold > SCOUT_MAX_SUGGESTED_AMOUNT).",
  );

  const tx = await guard.setApprovalThresholdUsdc(newThreshold);
  await tx.wait();
  console.log("setApprovalThresholdUsdc tx:", tx.hash);

  const oappAuthorized = await guard.authorizedCallers(oappAddr);
  if (!oappAuthorized) {
    console.log("Authorizing ORCAOApp on guard:", oappAddr);
    await (await guard.setAuthorizedCaller(oappAddr, true)).wait();
  } else {
    console.log("ORCAOApp already authorized on guard:", oappAddr);
  }

  const onChain = await guard.approvalThresholdUsdc();
  console.log("On-chain threshold now:", onChain.toString());

  artifact.configs = {
    ...artifact.configs,
    bridgeGuardThresholdUsdc: newThreshold.toString(),
  };
  fs.writeFileSync(latestPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log("Updated artifact:", latestPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
