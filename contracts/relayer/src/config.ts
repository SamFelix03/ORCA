import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { normalizeRecipientBytes32 } from "./message.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACTS_ROOT = path.resolve(__dirname, "..", "..");
export const REPO_ROOT = path.resolve(CONTRACTS_ROOT, "..");

dotenv.config({ path: path.join(CONTRACTS_ROOT, ".env") });

export const KITE_DOMAIN = 2368;
export const DISPATCH_ID_TOPIC0 = "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a";

export type DestChain = {
  domain: number;
  rpc: string;
  mailbox: string;
  name: string;
};

export type RelayerConfig = {
  origin: DestChain;
  destinations: Map<number, DestChain>;
  allowlistedRecipients: Set<string>;
  privateKey: string;
  pollMs: number;
  scanChunk: number;
  statePath: string;
  warpAsset: string;
};

type SpokeArtifact = {
  chainId: number;
  mailboxAddress: string;
  contracts: { RemoteAdapter: string; NoopISM?: string };
};

type IntegrationSnapshot = {
  routes: Record<
    string,
    {
      destinationDomain: number;
      destinationMailbox: string;
      destinationRouterBytes32: string;
    }
  >;
  mailboxes: Record<string, string>;
};

function rpcForDomain(domain: number): string {
  switch (domain) {
    case 11155111:
      return process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
    case 421614:
      return process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
    case 11155420:
      return process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io";
    case 84532:
      return process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
    default:
      throw new Error(`No RPC configured for domain ${domain}`);
  }
}

function nameForDomain(domain: number): string {
  const map: Record<number, string> = {
    11155111: "sepolia",
    421614: "arbitrumSepolia",
    11155420: "optimismSepolia",
    84532: "baseSepolia",
  };
  return map[domain] ?? String(domain);
}

export function loadRelayerConfig(): RelayerConfig {
  const pk =
    process.env.RELAYER_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set RELAYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const kiteMailbox = process.env.HYP_MAILBOX_KITE?.trim() ?? "0x0d5b681C5887617d68200B45F3947c99Cf402188";
  const kiteRpc = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";

  const allowlistedRecipients = new Set<string>();
  const destinations = new Map<number, DestChain>();

  const deploymentsDir = path.join(CONTRACTS_ROOT, "deployments");
  for (const name of fs.readdirSync(deploymentsDir)) {
    if (!name.endsWith(".spoke.json")) continue;
    const spoke = JSON.parse(fs.readFileSync(path.join(deploymentsDir, name), "utf8")) as SpokeArtifact;
    allowlistedRecipients.add(normalizeRecipientBytes32(spoke.contracts.RemoteAdapter));
    destinations.set(spoke.chainId, {
      domain: spoke.chainId,
      rpc: rpcForDomain(spoke.chainId),
      mailbox: spoke.mailboxAddress,
      name: name.replace(".spoke.json", ""),
    });
  }

  const snapPath =
    process.env.HYPERLANE_INTEGRATION_SNAPSHOT?.trim() ||
    path.join(REPO_ROOT, "hyperlane", "outputs", "snapshots", "orca-integration.latest.json");
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as IntegrationSnapshot;
  const warpAsset = (process.env.HYP_WARP_ASSET ?? "USDT").trim();

  for (const [routeId, route] of Object.entries(snap.routes)) {
    if (!routeId.startsWith(`${warpAsset}/kitetestnet-`)) continue;
    allowlistedRecipients.add(route.destinationRouterBytes32.toLowerCase());
    if (!destinations.has(route.destinationDomain)) {
      destinations.set(route.destinationDomain, {
        domain: route.destinationDomain,
        rpc: rpcForDomain(route.destinationDomain),
        mailbox: route.destinationMailbox,
        name: nameForDomain(route.destinationDomain),
      });
    }
  }

  const extra = process.env.RELAYER_EXTRA_RECIPIENTS?.trim();
  if (extra) {
    for (const a of extra.split(",")) {
      const t = a.trim();
      if (t) allowlistedRecipients.add(normalizeRecipientBytes32(t));
    }
  }

  const statePath = process.env.RELAYER_STATE_PATH?.trim() || path.join(CONTRACTS_ROOT, "relayer", "state.json");

  return {
    origin: {
      domain: KITE_DOMAIN,
      rpc: kiteRpc,
      mailbox: kiteMailbox,
      name: "kiteTestnet",
    },
    destinations,
    allowlistedRecipients,
    privateKey: pk.startsWith("0x") ? pk : `0x${pk}`,
    pollMs: Number(process.env.RELAYER_POLL_MS ?? "15000"),
    scanChunk: Number(process.env.RELAYER_SCAN_CHUNK ?? "40000"),
    statePath,
    warpAsset,
  };
}
