import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, formatUnits, getAddress, isAddress, JsonRpcProvider } from "ethers";
import { prisma } from "../db/prisma.js";

const VAULT_ABI = [
  "function underlying() view returns (address)",
  "function principalOf(address owner) view returns (uint256)",
  "function claimableOf(address owner) view returns (uint256 principal, uint256 yield_, uint256 total)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

type StubManifest = {
  protocols?: Array<{ slug: string; displayName?: string }>;
  chains?: Array<{
    chainId: number;
    name?: string;
    protocols?: Record<string, { vault?: string; vaultAddress?: string; address?: string } | string>;
  }>;
  stubsByChainId?: Record<string, Record<string, { vault?: string; vaultAddress?: string; address?: string } | string>>;
};

type RpcMap = Record<string, string | undefined>;

type RefreshedHolding = Awaited<ReturnType<typeof prisma.vaultHolding.upsert>>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const DEFAULT_RPC_BY_CHAIN: RpcMap = {
  "2368": process.env.KITE_RPC_URL ?? "https://rpc-testnet.gokite.ai",
  "84532": process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  "421614": process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
  "11155111": process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia.publicnode.com",
  "11155420": process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
};

const CHAIN_NAME_BY_ID: Record<number, string> = {
  2368: "Kite Testnet",
  84532: "Base Sepolia",
  421614: "Arbitrum Sepolia",
  11155111: "Ethereum Sepolia",
  11155420: "Optimism Sepolia",
};

function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function stubManifestPath(): string {
  return process.env.ORCA_STUB_PROTOCOL_MANIFEST_PATH
    ? path.resolve(process.env.ORCA_STUB_PROTOCOL_MANIFEST_PATH)
    : path.join(repoRoot, "agents/config/orca-stub-protocols.json");
}

function configuredRpcMap(): RpcMap {
  const raw = process.env.VAULT_HOLDINGS_RPC_MAP?.trim();
  if (!raw) return DEFAULT_RPC_BY_CHAIN;
  return { ...DEFAULT_RPC_BY_CHAIN, ...(JSON.parse(raw) as RpcMap) };
}

function vaultAddress(value: { vault?: string; vaultAddress?: string; address?: string } | string | undefined): string | null {
  const raw = typeof value === "string" ? value : value?.vault ?? value?.vaultAddress ?? value?.address;
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

async function readVaultToken(provider: JsonRpcProvider, vault: string, fallbackSymbol: string) {
  const contract = new Contract(vault, VAULT_ABI, provider);
  try {
    const underlying = getAddress(String(await contract.underlying()));
    const token = new Contract(underlying, ERC20_ABI, provider);
    const [decimalsResult, symbolResult] = await Promise.allSettled([token.decimals(), token.symbol()]);
    const symbol = symbolResult.status === "fulfilled" ? String(symbolResult.value).trim().toUpperCase() : "";
    return {
      address: underlying,
      decimals: decimalsResult.status === "fulfilled" ? Number(decimalsResult.value) : 18,
      symbol: symbol || fallbackSymbol,
    };
  } catch {
    return {
      address: null,
      decimals: Number(process.env.VAULT_HOLDINGS_TOKEN_DECIMALS ?? "18"),
      symbol: fallbackSymbol,
    };
  }
}

async function readVaultBalance(provider: JsonRpcProvider, vault: string, ownerWallet: string): Promise<bigint> {
  const contract = new Contract(vault, VAULT_ABI, provider);
  try {
    const claimable = await contract.claimableOf(ownerWallet);
    if (Array.isArray(claimable) && claimable.length >= 3) {
      return BigInt(claimable[2]);
    }
    return BigInt(claimable);
  } catch {
    return BigInt((await contract.principalOf(ownerWallet)) as bigint);
  }
}

export async function refreshVaultHoldings(ownerWalletInput: string): Promise<RefreshedHolding[]> {
  const ownerWallet = getAddress(ownerWalletInput);
  const manifest = loadJsonFile<StubManifest>(stubManifestPath());
  const rpcByChain = configuredRpcMap();
  const fallbackToken = process.env.VAULT_HOLDINGS_TOKEN_SYMBOL ?? "USDT";
  const providers = new Map<number, JsonRpcProvider>();
  const chains =
    manifest.chains ??
    Object.entries(manifest.stubsByChainId ?? {}).map(([chainId, protocols]) => ({
      chainId: Number(chainId),
      name: CHAIN_NAME_BY_ID[Number(chainId)] ?? `Chain ${chainId}`,
      protocols,
    }));

  const tasks = chains.flatMap((chain) => {
    const rpc = rpcByChain[String(chain.chainId)];
    if (!rpc) return [];
    let provider = providers.get(chain.chainId);
    if (!provider) {
      provider = new JsonRpcProvider(rpc);
      providers.set(chain.chainId, provider);
    }
    return Object.entries(chain.protocols ?? {}).flatMap(([protocol, value]) => {
      const vault = vaultAddress(value);
      if (!vault) return [];
      return [
        async () => {
          const [{ decimals, symbol }, raw] = await Promise.all([
            readVaultToken(provider, vault, fallbackToken),
            readVaultBalance(provider, vault, ownerWallet),
          ]);
          const amount = Number(formatUnits(raw, decimals));
          const row = await prisma.vaultHolding.upsert({
            where: {
              ownerWallet_vaultAddress_chainId_protocol_token: {
                ownerWallet,
                vaultAddress: vault,
                chainId: chain.chainId,
                protocol,
                token: symbol,
              },
            },
            update: {
              ownerWallet,
              vaultAddress: vault,
              chainId: chain.chainId,
              chainName: chain.name ?? CHAIN_NAME_BY_ID[chain.chainId] ?? `Chain ${chain.chainId}`,
              protocol,
              token: symbol,
              balanceRaw: raw.toString(),
              decimals,
              amountUsdc: amount,
            },
            create: {
              ownerWallet,
              vaultAddress: vault,
              chainId: chain.chainId,
              chainName: chain.name ?? CHAIN_NAME_BY_ID[chain.chainId] ?? `Chain ${chain.chainId}`,
              protocol,
              token: symbol,
              balanceRaw: raw.toString(),
              decimals,
              amountUsdc: amount,
            },
          });
          await prisma.vaultHolding.deleteMany({
            where: {
              ownerWallet,
              vaultAddress: vault,
              chainId: chain.chainId,
              protocol,
              token: { not: symbol },
            },
          });
          return row;
        },
      ];
    });
  });

  const results = await Promise.allSettled(tasks.map((task) => task()));
  const holdings = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

  if (holdings.length === 0 && tasks.length > 0) {
    const firstError = results.find((result) => result.status === "rejected");
    if (firstError?.status === "rejected") {
      throw firstError.reason instanceof Error ? firstError.reason : new Error(String(firstError?.reason));
    }
  }

  return holdings;
}
