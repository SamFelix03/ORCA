import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const KITE_DOMAIN = 2368;

function loadOappFromArtifact(): string {
  const latest = path.join(ROOT, "deployments", "kite-testnet.latest.json");
  const j = JSON.parse(fs.readFileSync(latest, "utf8")) as { contracts: { ORCAOApp: string } };
  return ethers.getAddress(j.contracts.ORCAOApp);
}

const ORCA_OAPP_ABI = ["function setTrustedRemote(uint32 domain, bytes32 remote) external"];
const REMOTE_ADAPTER_ABI = ["function setTrustedSender(uint32 domain, bytes32 sender) external"];

const RPC: Record<string, string> = {
  kiteTestnet: process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai",
  sepolia: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  arbitrumSepolia: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
  optimismSepolia: process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
  baseSepolia: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
};

function loadSpokes(): Array<{ network: string; path: string; domain: number; remoteAdapter: string }> {
  const deploymentsDir = path.join(ROOT, "deployments");
  const out: Array<{ network: string; path: string; domain: number; remoteAdapter: string }> = [];
  for (const name of fs.readdirSync(deploymentsDir)) {
    if (!name.endsWith(".spoke.json")) continue;
    const full = path.join(deploymentsDir, name);
    const j = JSON.parse(fs.readFileSync(full, "utf8")) as {
      network: string;
      chainId: number;
      contracts: { RemoteAdapter: string };
    };
    out.push({
      network: j.network,
      path: full,
      domain: j.chainId,
      remoteAdapter: j.contracts.RemoteAdapter,
    });
  }
  return out.sort((a, b) => a.domain - b.domain);
}

async function main(): Promise<void> {
  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const spokes = loadSpokes();
  if (spokes.length !== 4) {
    throw new Error(`Expected 4 *.spoke.json, found ${spokes.length}`);
  }

  const OAPP_KITE = loadOappFromArtifact();
  // eslint-disable-next-line no-console -- CLI
  console.log("ORCAOApp (kite-testnet.latest.json):", OAPP_KITE);

  const kiteUrl = RPC.kiteTestnet;
  const walletKite = new ethers.Wallet(pk, new ethers.JsonRpcProvider(kiteUrl));
  const oapp = new ethers.Contract(OAPP_KITE, ORCA_OAPP_ABI, walletKite);
  const oappPadded = ethers.zeroPadValue(OAPP_KITE, 32);

  // eslint-disable-next-line no-console -- CLI
  console.log("Kite: setTrustedRemote → spoke RemoteAdapter (bytes32)…");
  for (const s of spokes) {
    const remote32 = ethers.zeroPadValue(s.remoteAdapter, 32);
    const tx = await oapp.setTrustedRemote(s.domain, remote32);
    // eslint-disable-next-line no-console -- CLI
    console.log(`  domain ${s.domain} tx ${tx.hash}`);
    await tx.wait();
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("Each spoke: RemoteAdapter.setTrustedSender(2368, ORCAOApp)…");
  for (const s of spokes) {
    const url = RPC[s.network];
    if (!url) {
      throw new Error(`No RPC for network ${s.network}`);
    }
    const w = new ethers.Wallet(pk, new ethers.JsonRpcProvider(url));
    const ra = new ethers.Contract(s.remoteAdapter, REMOTE_ADAPTER_ABI, w);
    const tx = await ra.setTrustedSender(KITE_DOMAIN, oappPadded);
    // eslint-disable-next-line no-console -- CLI
    console.log(`  ${s.network} tx ${tx.hash}`);
    await tx.wait();
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("Trust wiring complete.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
