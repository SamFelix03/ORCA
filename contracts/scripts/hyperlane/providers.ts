import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DEST_KEY_TO_HARDHAT, HUB_CHAIN_KEY } from "./types";

export function getRpcUrl(hre: HardhatRuntimeEnvironment, hardhatNetwork: string): string {
  const net = hre.config.networks[hardhatNetwork];
  if (!net || typeof net !== "object" || !("url" in net) || typeof (net as { url?: string }).url !== "string") {
    throw new Error(`No url in hardhat.config for network: ${hardhatNetwork}`);
  }
  return (net as { url: string }).url;
}

export function hardhatNetworkForDestKey(destKey: string): string {
  const n = DEST_KEY_TO_HARDHAT[destKey.toLowerCase()];
  if (!n) {
    throw new Error(`Unknown HYP_DEST ${destKey}. Expected one of: ${Object.keys(DEST_KEY_TO_HARDHAT).join(", ")}`);
  }
  return n;
}

export function hubHardhatNetwork(hre?: HardhatRuntimeEnvironment): string {
  const fromEnv = process.env.HUB_HARDHAT_NETWORK?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const key = HUB_CHAIN_KEY;
  return DEST_KEY_TO_HARDHAT[key] ?? "kiteTestnet";
}
