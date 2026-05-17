"use client";

import type { ConnectedWallet } from "@privy-io/react-auth";
import { ensureWalletChain, getInjectedEthereum, type InjectedEthereum } from "@/lib/scout-registration";

const CHAIN_ADD_PARAMS: Record<
  number,
  {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  2368: {
    chainId: "0x940",
    chainName: "Kite Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc-testnet.gokite.ai"],
    blockExplorerUrls: ["https://testnet.kitescan.ai"],
  },
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  421614: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Ethereum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  11155420: {
    chainId: "0xaa37dc",
    chainName: "Optimism Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.optimism.io"],
    blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"],
  },
};

/** EIP-1193 provider for the Privy-linked wallet; falls back to injected MetaMask only if needed. */
export async function resolveEthereumProvider(
  wallets: ConnectedWallet[],
  walletAddress: string | null,
): Promise<InjectedEthereum> {
  if (walletAddress) {
    const match = wallets.find((w) => w.address?.toLowerCase() === walletAddress.toLowerCase());
    const getProvider = (match as { getEthereumProvider?: () => Promise<InjectedEthereum> } | undefined)
      ?.getEthereumProvider;
    if (typeof getProvider === "function") {
      const provider = await getProvider();
      if (provider) return provider;
    }
  }
  const injected = getInjectedEthereum();
  if (!injected) {
    throw new Error("No wallet provider found. Sign in with Privy or connect a wallet.");
  }
  return injected;
}

export async function ensureWalletOnChain(eth: InjectedEthereum, chainId: number): Promise<void> {
  try {
    await ensureWalletChain(eth, chainId);
    return;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
  }
  const addParams = CHAIN_ADD_PARAMS[chainId];
  if (!addParams) {
    throw new Error(`Wallet is not on chain ${chainId}. Add this network in your wallet and try again.`);
  }
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [addParams],
  });
  await ensureWalletChain(eth, chainId);
}

export function explorerTxUrl(chainId: number, txHash: string): string {
  const base =
    CHAIN_ADD_PARAMS[chainId]?.blockExplorerUrls[0] ??
    (chainId === 2368 ? "https://testnet.kitescan.ai" : "https://etherscan.io");
  return `${base}/tx/${txHash}`;
}
