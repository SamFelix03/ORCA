import { JsonRpcProvider, Contract } from "ethers";
import { config } from "../config.js";

const ORCA_REGISTRY_ABI = [
  "function currentEpochId() view returns (uint256)",
  "function getVaultForAgent(bytes32 did) view returns (address)",
];

const SPENDING_ENFORCER_ABI = [
  "function spentInWindow() view returns (uint256)",
  "function windowStart() view returns (uint256)",
  "function pausedUntil() view returns (uint256)",
];

function createProvider() {
  return new JsonRpcProvider(config.kiteRpcUrl, config.kiteChainId);
}

export async function readKiteNetworkStatus() {
  const provider = createProvider();
  const blockNumber = await provider.getBlockNumber();
  return {
    rpcUrl: config.kiteRpcUrl,
    chainId: config.kiteChainId,
    latestBlock: blockNumber,
  };
}

export async function readRegistryEpoch() {
  if (!config.orcaRegistryAddress) {
    return null;
  }

  const provider = createProvider();
  const contract = new Contract(config.orcaRegistryAddress, ORCA_REGISTRY_ABI, provider);
  const epoch = await contract.currentEpochId();

  return Number(epoch);
}

export async function readSpendingWindowSnapshot() {
  if (!config.spendingRuleEnforcerAddress) {
    return null;
  }

  const provider = createProvider();
  const contract = new Contract(config.spendingRuleEnforcerAddress, SPENDING_ENFORCER_ABI, provider);

  const [spentInWindow, windowStart, pausedUntil] = await Promise.all([
    contract.spentInWindow(),
    contract.windowStart(),
    contract.pausedUntil(),
  ]);

  return {
    spentInWindow: spentInWindow.toString(),
    windowStart: Number(windowStart),
    pausedUntil: Number(pausedUntil),
  };
}
