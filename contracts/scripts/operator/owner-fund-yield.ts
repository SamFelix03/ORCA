import { ethers } from "hardhat";

/**
 * Owner seeds `rewardReserve` on a stub vault (bound underlying).
 *
 * Env:
 *   STUB_VAULT — deployed Orca*StubVault address
 *   FUND_AMOUNT — base units to pull from owner via underlying.transferFrom
 */
async function main(): Promise<void> {
  const vaultAddr = process.env.STUB_VAULT?.trim();
  if (!vaultAddr) {
    throw new Error("Set STUB_VAULT.");
  }
  const amountRaw = process.env.FUND_AMOUNT?.trim();
  if (!amountRaw) {
    throw new Error("Set FUND_AMOUNT (base units).");
  }
  const amount = BigInt(amountRaw);
  if (amount <= 0n) {
    throw new Error("FUND_AMOUNT must be > 0");
  }

  const [signer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("OrcaStubYieldVaultBase", ethers.getAddress(vaultAddr), signer);

  const underlyingAddr: string = await vault.underlying();
  const token = new Contract(
    underlyingAddr,
    ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"],
    signer,
  );
  const v = await vault.getAddress();
  const allowance: bigint = await token.allowance(signer.address, v);
  if (allowance < amount) {
    const tx = await token.approve(v, amount);
    await tx.wait();
  }

  const tx = await vault.fundRewards(amount);
  await tx.wait();
  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify({ stubVault: v, fundAmount: amount.toString(), txHash: tx.hash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
