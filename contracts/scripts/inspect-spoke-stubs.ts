/**
 * Read Sepolia stub vault principalOf for a beneficiary.
 *   BENEFICIARY=0x... pnpm exec hardhat run scripts/inspect-spoke-stubs.ts --network sepolia
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const STUB_ABI = [
  "function principalOf(address) view returns (uint256)",
  "function underlying() view returns (address)",
  "function apyBps() view returns (uint256)",
];

async function main(): Promise<void> {
  const spoke = JSON.parse(
    fs.readFileSync(path.join(ROOT, "deployments", "sepolia.spoke.json"), "utf8"),
  ) as {
    underlying: { address: string };
    contracts: Record<string, string>;
  };

  const beneficiary = ethers.getAddress(
    process.env.BENEFICIARY?.trim() || "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844",
  );

  const stubs: Array<{ name: string; address: string }> = [
    { name: "aave-v3", address: spoke.contracts.OrcaAaveV3StubVault },
    { name: "compound-v3", address: spoke.contracts.OrcaCompoundV3StubVault },
    { name: "morpho", address: spoke.contracts.OrcaMorphoBlueStubVault },
    { name: "uniswap-v3", address: spoke.contracts.OrcaUniswapV3StubVault },
  ];

  const out: Record<string, unknown> = {
    network: "sepolia",
    beneficiary,
    underlyingUsdt: spoke.underlying.address,
    stubs: {} as Record<string, unknown>,
  };

  for (const s of stubs) {
    const c = await ethers.getContractAt(STUB_ABI, s.address);
    const principal = await c.principalOf(beneficiary);
    let apy = "n/a";
    try {
      apy = (await c.apyBps()).toString();
    } catch {
      /* */
    }
    (out.stubs as Record<string, unknown>)[s.name] = {
      address: s.address,
      principalWei: principal.toString(),
      underlying: spoke.underlying.address,
      apyBps: apy,
      etherscan: `https://sepolia.etherscan.io/address/${s.address}#readContract`,
    };
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
