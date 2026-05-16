/**
 * Read stub vault `principalOf(beneficiary)` — deposited yield principal on a spoke chain.
 *
 *   cd contracts
 *   pnpm stub:principal                              # sepolia, default beneficiary
 *   STUB=morpho pnpm stub:principal                  # one vault only
 *   BENEFICIARY=0x... HYP_DEST=arbitrumsepolia pnpm stub:principal --network arbitrumSepolia
 *
 * "Beneficiary" = address encoded in the OApp rebalance message. On delivery, RemoteAdapter
 * does transferFrom(beneficiary, …) then stub.depositFor(beneficiary). It is NOT the
 * Hyperlane warp recipient; warp mints USDT directly to RECIPIENT on the spoke.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import hre from "hardhat";
import { ethers } from "hardhat";
import { hardhatNetworkForDestKey } from "./hyperlane/providers";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const STUB_ABI = [
  "function principalOf(address) view returns (uint256)",
  "function underlying() view returns (address)",
  "function apyBps() view returns (uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

type SpokeArtifact = {
  network: string;
  chainId: number;
  underlying: { address: string; symbol?: string };
  contracts: {
    OrcaAaveV3StubVault: string;
    OrcaCompoundV3StubVault: string;
    OrcaMorphoBlueStubVault: string;
    OrcaUniswapV3StubVault: string;
  };
};

const STUB_KEYS: Record<string, keyof SpokeArtifact["contracts"]> = {
  "aave-v3": "OrcaAaveV3StubVault",
  "aave": "OrcaAaveV3StubVault",
  compound: "OrcaCompoundV3StubVault",
  "compound-v3": "OrcaCompoundV3StubVault",
  morpho: "OrcaMorphoBlueStubVault",
  uni: "OrcaUniswapV3StubVault",
  "uniswap-v3": "OrcaUniswapV3StubVault",
};

function loadSpoke(): SpokeArtifact {
  const destKey = (process.env.HYP_DEST ?? "sepolia").toLowerCase();
  const net = hre.network.name !== "hardhat" ? hre.network.name : hardhatNetworkForDestKey(destKey);
  const spokePath = path.join(ROOT, "deployments", `${net}.spoke.json`);
  if (!fs.existsSync(spokePath)) {
    throw new Error(`Missing ${spokePath}. Deploy spoke or set --network / HYP_DEST.`);
  }
  return JSON.parse(fs.readFileSync(spokePath, "utf8")) as SpokeArtifact;
}

function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

async function main(): Promise<void> {
  const spoke = loadSpoke();
  const beneficiary = ethers.getAddress(
    process.env.BENEFICIARY?.trim() ||
      process.env.SCOUT_CROSS_CHAIN_BENEFICIARY?.trim() ||
      "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844",
  );

  const token = new ethers.Contract(spoke.underlying.address, ERC20_ABI, ethers.provider);
  let decimals = 18;
  let symbol = spoke.underlying.symbol ?? "USDT";
  try {
    decimals = Number(await token.decimals());
    symbol = await token.symbol();
  } catch {
    /* default 18 */
  }

  const onlyStub = process.env.STUB?.trim().toLowerCase();

  const entries: Array<{ label: string; address: string }> = [
    { label: "aave-v3", address: spoke.contracts.OrcaAaveV3StubVault },
    { label: "compound-v3", address: spoke.contracts.OrcaCompoundV3StubVault },
    { label: "morpho", address: spoke.contracts.OrcaMorphoBlueStubVault },
    { label: "uniswap-v3", address: spoke.contracts.OrcaUniswapV3StubVault },
  ].filter((e) => !onlyStub || e.label === onlyStub || STUB_KEYS[onlyStub] === undefined);

  if (onlyStub && STUB_KEYS[onlyStub]) {
    const key = STUB_KEYS[onlyStub];
    const addr = spoke.contracts[key];
    entries.length = 0;
    entries.push({ label: onlyStub, address: addr });
  }

  const rows: Array<{
    stub: string;
    vault: string;
    principalRaw: string;
    principalFormatted: string;
    apyBps: string;
  }> = [];

  for (const { label, address } of entries) {
    const vault = await ethers.getContractAt(STUB_ABI, address);
    const principal: bigint = await vault.principalOf(beneficiary);
    let apy = "n/a";
    try {
      apy = (await vault.apyBps()).toString();
    } catch {
      /* */
    }
    rows.push({
      stub: label,
      vault: address,
      principalRaw: principal.toString(),
      principalFormatted: `${formatUnits(principal, decimals)} ${symbol}`,
      apyBps: apy,
    });
  }

  const walletBal = await token.balanceOf(beneficiary);

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        spoke: spoke.network,
        chainId: spoke.chainId,
        beneficiary,
        note:
          "principalOf = USDT deposited in stub via RemoteAdapter.handle (OApp path). " +
          "walletBalance = loose synthetic USDT in wallet (e.g. from warp); not the same as stub principal.",
        underlying: { address: spoke.underlying.address, symbol, decimals },
        beneficiaryWalletBalance: {
          raw: walletBal.toString(),
          formatted: `${formatUnits(walletBal, decimals)} ${symbol}`,
        },
        stubPrincipal: rows,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
