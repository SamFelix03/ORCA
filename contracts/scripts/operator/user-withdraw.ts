import { ethers } from "hardhat";

/**
 * Connected wallet performs full exit on a stub vault (principal + accrued stub yield).
 *
 * Env:
 *   STUB_VAULT — deployed Orca*StubVault address
 */
async function main(): Promise<void> {
  const vaultAddr = process.env.STUB_VAULT?.trim();
  if (!vaultAddr) {
    throw new Error("Set STUB_VAULT.");
  }
  const [signer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("OrcaStubYieldVaultBase", ethers.getAddress(vaultAddr), signer);
  const tx = await vault.withdraw();
  await tx.wait();
  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify({ stubVault: await vault.getAddress(), txHash: tx.hash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
