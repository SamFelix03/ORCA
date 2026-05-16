import fs from "node:fs";
import path from "node:path";

export type IntegrationRoute = {
  origin: string;
  destination: string;
  originDomain: number;
  destinationDomain: number;
  originMailbox: string;
  destinationMailbox: string;
  originRouter: string;
  destinationRouter: string;
  originRouterBytes32: string;
  destinationRouterBytes32: string;
  token: string;
};

export type IntegrationSnapshot = {
  schemaVersion: number;
  hubChain: string;
  domains: Record<string, number>;
  mailboxes: Record<string, string>;
  routes: Record<string, IntegrationRoute>;
};

/** Kite hub key in snapshot JSON (lowercase). */
export const HUB_CHAIN_KEY = "kitetestnet";

/** Map snapshot destination keys → Hardhat network names in hardhat.config.ts */
export const DEST_KEY_TO_HARDHAT: Record<string, string> = {
  kitetestnet: "kiteTestnet",
  sepolia: "sepolia",
  arbitrumsepolia: "arbitrumSepolia",
  optimismsepolia: "optimismSepolia",
  basesepolia: "baseSepolia",
};

export function loadSnapshot(snapshotPath?: string): IntegrationSnapshot {
  const resolved =
    snapshotPath?.trim() ||
    process.env.HYPERLANE_INTEGRATION_SNAPSHOT?.trim() ||
    path.resolve(__dirname, "..", "..", "..", "hyperlane", "outputs", "snapshots", "orca-integration.latest.json");

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Hyperlane integration snapshot not found at ${resolved}. Set HYPERLANE_INTEGRATION_SNAPSHOT or run export from repo root.`,
    );
  }

  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as IntegrationSnapshot;
}

export function routeKey(hubKey: string, destKey: string, asset = "USDT"): string {
  return `${asset}/${hubKey.toLowerCase()}-${destKey.toLowerCase()}`;
}

/**
 * Resolve a hub→spoke route. `asset` must match snapshot key prefix (`USDT/...` = faucet USDT collateral on Kite;
 * `PIEUSD/...` = payments token only). Set via `HYP_WARP_ASSET` in transfer / smoke scripts.
 */
export function getRoute(snapshot: IntegrationSnapshot, destKey: string, asset = "USDT"): IntegrationRoute {
  const key = routeKey(snapshot.hubChain, destKey, asset);
  const route = snapshot.routes[key];
  if (!route) {
    const available = Object.keys(snapshot.routes).join(", ");
    throw new Error(`No route for ${key}. Available routes: ${available}`);
  }
  return route;
}
