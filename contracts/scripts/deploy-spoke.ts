import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

/**
 * Deploy **destination-chain** ORCA surface: `RemoteAdapter` + four stub vaults with the same underlying (e.g. USDT).
 * Hub-only contracts (`ORCAOApp`, `ClientAgentVault`, …) stay on Kite; run `deploy.ts` there.
 *
 * Env:
 *   ORCA_UNDERLYING_TOKEN — required (this chain’s USDT)
 *   ORCA_SPOKE_MAILBOX     — required; this chain’s Hyperlane mailbox (see `hyperlane/chains.testnet.json` / export)
 *   INITIAL_OWNER          — optional; defaults to first signer
 *   ORCA_STUB_APY_BPS      — optional (default 500)
 *
 * Writes: deployments/<network>.spoke.json
 */
async function main(): Promise<void> {
  const underlyingRaw = process.env.ORCA_UNDERLYING_TOKEN?.trim();
  if (!underlyingRaw) {
    throw new Error("Set ORCA_UNDERLYING_TOKEN (ERC20 on this chain).");
  }
  const mailboxRaw = process.env.ORCA_SPOKE_MAILBOX?.trim();
  if (!mailboxRaw) {
    throw new Error("Set ORCA_SPOKE_MAILBOX to this chain’s Hyperlane mailbox address.");
  }

  const underlying = await ethers.getAddress(underlyingRaw);
  const mailbox = await ethers.getAddress(mailboxRaw);

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

  const remoteAdapter = await ethers.deployContract("RemoteAdapter", [owner, mailbox, underlying]);
  await remoteAdapter.waitForDeployment();
  const remoteAdapterAddress = await remoteAdapter.getAddress();

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
    schemaVersion: 2,
    role: "hyperlane-spoke",
    deployedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    deployer: deployer.address,
    owner,
    mailboxAddress: mailbox,
    underlying: {
      address: underlying,
      symbol,
    },
    apyBps: apyBps.toString(),
    contracts: {
      RemoteAdapter: remoteAdapterAddress,
      OrcaAaveV3StubVault: await aave.getAddress(),
      OrcaCompoundV3StubVault: await compound.getAddress(),
      OrcaMorphoBlueStubVault: await morpho.getAddress(),
      OrcaUniswapV3StubVault: await uni.getAddress(),
    },
  };

  const root = path.resolve(__dirname, "..");
  const deploymentsDir = path.join(root, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const outPath = path.join(deploymentsDir, `${network.name}.spoke.json`);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  // eslint-disable-next-line no-console -- deploy script
  console.log("Wrote", outPath);
  // eslint-disable-next-line no-console -- CLI
  console.log(
    "Next: owner calls RemoteAdapter.setTrustedSender(<kiteDomain 2368>, <ORCAOApp bytes32 padded>) on this chain.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
