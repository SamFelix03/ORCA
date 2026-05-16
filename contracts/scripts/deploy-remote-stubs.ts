import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

/**
 * Deploy the four ORCA stub vaults on the **current** Hardhat network using one underlying ERC20.
 *
 * Env:
 *   ORCA_UNDERLYING_TOKEN — required (per-chain USDT or other ERC20)
 *   INITIAL_OWNER — optional; defaults to first signer
 *   ORCA_STUB_APY_BPS — optional annual yield bps (default 500)
 *
 * Writes: deployments/<network>.stubs.json
 */
async function main(): Promise<void> {
  const underlyingRaw = process.env.ORCA_UNDERLYING_TOKEN?.trim();
  if (!underlyingRaw) {
    throw new Error("Set ORCA_UNDERLYING_TOKEN to the ERC20 address for this chain.");
  }
  const underlying = await ethers.getAddress(underlyingRaw);

  const [deployer] = await ethers.getSigners();
  const owner = process.env.INITIAL_OWNER?.trim()
    ? await ethers.getAddress(process.env.INITIAL_OWNER.trim())
    : deployer.address;

  const apyBps = BigInt(process.env.ORCA_STUB_APY_BPS?.trim() ?? "500");

  let symbol: string | null = null;
  try {
    const meta = new ethers.Contract(underlying, ["function symbol() view returns (string)"], ethers.provider);
    symbol = await meta.symbol();
  } catch {
    symbol = null;
  }

  const aave = await ethers.deployContract("OrcaAaveV3StubVault", [owner, underlying, apyBps]);
  await aave.waitForDeployment();

  const compound = await ethers.deployContract("OrcaCompoundV3StubVault", [owner, underlying, apyBps]);
  await compound.waitForDeployment();

  const morpho = await ethers.deployContract("OrcaMorphoBlueStubVault", [owner, underlying, apyBps]);
  await morpho.waitForDeployment();

  const uni = await ethers.deployContract("OrcaUniswapV3StubVault", [owner, underlying, apyBps]);
  await uni.waitForDeployment();

  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const artifact = {
    schemaVersion: 1,
    deployedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    deployer: deployer.address,
    owner,
    underlying: {
      address: underlying,
      symbol,
    },
    apyBps: apyBps.toString(),
    stubs: {
      OrcaAaveV3StubVault: await aave.getAddress(),
      OrcaCompoundV3StubVault: await compound.getAddress(),
      OrcaMorphoBlueStubVault: await morpho.getAddress(),
      OrcaUniswapV3StubVault: await uni.getAddress(),
    },
  };

  const root = path.resolve(__dirname, "..");
  const deploymentsDir = path.join(root, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const fileBase = `${network.name}.stubs.json`;
  const outPath = path.join(deploymentsDir, fileBase);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  // eslint-disable-next-line no-console -- deploy script
  console.log("Wrote", outPath);
  // eslint-disable-next-line no-console -- deploy script
  console.log(JSON.stringify(artifact.stubs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
