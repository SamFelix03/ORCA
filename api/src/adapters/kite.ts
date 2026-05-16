import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Contract, formatEther, formatUnits, getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";
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

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const TREASURY_ABI = [
  "function threshold() view returns (uint256)",
  "function signerCount() view returns (uint256)",
];

const POAI_ABI = [
  "function getEpochRecordCount(uint256 epochId) view returns (uint256)",
  "function getEpochRecord(uint256 epochId, uint256 index) view returns (tuple(bytes32 agentDID,uint8 actionType,bytes32 inputHash,bytes32 outcomeHash,int256 valueDelta,uint256 timestamp))",
];

const ACTION_TYPES = ["SIGNAL", "RISK_EVAL", "EXECUTION", "AUDIT"] as const;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function createProvider() {
  return new JsonRpcProvider(config.kiteRpcUrl, config.kiteChainId);
}

function readDeployment() {
  const file = path.join(repoRoot, "contracts/deployments/kite-testnet.latest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as {
    treasuryMultisig?: string;
    configs?: { multisigSigners?: string[]; multisigThreshold?: number };
    contracts?: { ORCAMultisigTreasury?: string };
  };
}

function configuredTreasuryAddress(): string | null {
  const deployment = readDeployment();
  const raw = config.treasuryAddress || deployment?.contracts?.ORCAMultisigTreasury || deployment?.treasuryMultisig || "";
  return raw && isAddress(raw) ? getAddress(raw) : null;
}

function configuredSigners(): string[] {
  const deployment = readDeployment();
  const envSigners = (process.env.TREASURY_SIGNERS ?? process.env.MULTISIG_SIGNERS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => isAddress(item))
    .map(getAddress);
  if (envSigners.length > 0) return envSigners;
  return (deployment?.configs?.multisigSigners ?? []).filter((item) => isAddress(item)).map(getAddress);
}

async function readTokenBalance(provider: JsonRpcProvider, owner: string, symbol: string, address: string) {
  const contract = new Contract(address, ERC20_ABI, provider);
  const [raw, decimalsResult, symbolResult] = await Promise.allSettled([
    contract.balanceOf(owner),
    contract.decimals(),
    contract.symbol(),
  ]);
  if (raw.status !== "fulfilled") return null;
  const decimals = decimalsResult.status === "fulfilled" ? Number(decimalsResult.value) : 18;
  return {
    symbol: symbolResult.status === "fulfilled" ? String(symbolResult.value) : symbol,
    address: getAddress(address),
    raw: raw.value.toString(),
    decimals,
    balance: Number(formatUnits(raw.value, decimals)),
  };
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

export async function readTreasurySnapshot() {
  const address = configuredTreasuryAddress();
  if (!address) {
    return {
      address: null,
      nativeBalance: 0,
      tokenBalances: [],
      threshold: "0/0",
      signers: [],
    };
  }

  const provider = createProvider();
  const deployment = readDeployment();
  const treasury = new Contract(address, TREASURY_ABI, provider);
  const [nativeRaw, thresholdResult, signerCountResult] = await Promise.allSettled([
    provider.getBalance(address),
    treasury.threshold(),
    treasury.signerCount(),
  ]);
  const signers = configuredSigners();
  const tokenCandidates = [
    { symbol: "PIEUSD", address: config.pieUsdAddress },
    { symbol: "USDT", address: config.usdtAddress },
  ].filter((item, index, all) => item.address && isAddress(item.address) && all.findIndex((other) => other.address.toLowerCase() === item.address.toLowerCase()) === index);
  const tokenBalances = (
    await Promise.all(tokenCandidates.map((item) => readTokenBalance(provider, address, item.symbol, item.address)))
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const threshold = thresholdResult.status === "fulfilled" ? Number(thresholdResult.value) : deployment?.configs?.multisigThreshold ?? 0;
  const signerCount = signerCountResult.status === "fulfilled" ? Number(signerCountResult.value) : signers.length;

  return {
    address,
    nativeBalance: nativeRaw.status === "fulfilled" ? Number(formatEther(nativeRaw.value)) : 0,
    tokenBalances,
    threshold: `${threshold}/${signerCount}`,
    signers,
  };
}

export async function readPoaiEpochRecords(epochId: number) {
  if (!config.poaiAttributionAddress) return [];
  const provider = createProvider();
  const poai = new Contract(config.poaiAttributionAddress, POAI_ABI, provider);
  const count = Number(await poai.getEpochRecordCount(epochId));
  const knownDidByHash = new Map(
    ["did:kite:orca/scout-1", "did:kite:orca/risk-1", "did:kite:orca/executor-1", "did:kite:orca/audit-1"].map((did) => [
      keccak256(toUtf8Bytes(did)).toLowerCase(),
      did,
    ]),
  );
  const records = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const row = await poai.getEpochRecord(epochId, index);
      const agentDidHash = String(row.agentDID);
      const timestamp = Number(row.timestamp);
      return {
        epochId,
        agentDid: knownDidByHash.get(agentDidHash.toLowerCase()) ?? agentDidHash,
        agentDidHash,
        actionType: ACTION_TYPES[Number(row.actionType)] ?? "AUDIT",
        valueDelta: Number(row.valueDelta),
        inputHash: String(row.inputHash),
        outcomeHash: String(row.outcomeHash),
        createdAt: new Date(timestamp * 1000).toISOString(),
      };
    }),
  );
  return records.reverse();
}
