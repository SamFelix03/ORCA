"use client";

import type { VaultHoldingRecord } from "@orca/shared";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { getAddress, Interface, MaxUint256 } from "ethers";
import {
  ensureWalletChain,
  getInjectedEthereum,
  sendEvmTransaction,
  waitForTxReceipt,
  type InjectedEthereum,
} from "@/lib/scout-registration";

const vaultIface = new Interface([
  "function underlying() view returns (address)",
  "function withdraw()",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
]);

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

export function explorerTxUrl(chainId: number, txHash: string): string {
  const base =
    CHAIN_ADD_PARAMS[chainId]?.blockExplorerUrls[0] ??
    (chainId === 2368 ? "https://testnet.kitescan.ai" : "https://etherscan.io");
  return `${base}/tx/${txHash}`;
}

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
    throw new Error("No wallet provider found. Connect a wallet in Privy or install MetaMask.");
  }
  return injected;
}

async function ensureWalletOnChain(eth: InjectedEthereum, chainId: number): Promise<void> {
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

async function ethCall(eth: InjectedEthereum, to: string, data: string): Promise<string> {
  return (await eth.request({
    method: "eth_call",
    params: [{ to: getAddress(to), data }, "latest"],
  })) as string;
}

async function encodeWithdrawCalldata(
  eth: InjectedEthereum,
  holding: VaultHoldingRecord,
  owner: string,
): Promise<string> {
  const vault = getAddress(holding.vaultAddress);
  if (holding.protocol === "aave-v3") {
    const underlyingRaw = await ethCall(eth, vault, vaultIface.encodeFunctionData("underlying", []));
    const decoded = vaultIface.decodeFunctionResult("underlying", underlyingRaw);
    const asset = decoded[0] as string;
    return vaultIface.encodeFunctionData("withdraw", [getAddress(asset), MaxUint256, getAddress(owner)]);
  }
  return vaultIface.encodeFunctionData("withdraw", []);
}

export async function withdrawStubVaultHolding(params: {
  holding: VaultHoldingRecord;
  ownerAddress: string;
  wallets: ConnectedWallet[];
}): Promise<string> {
  const { holding, ownerAddress, wallets } = params;
  if (BigInt(holding.balanceRaw || "0") <= BigInt(0)) {
    throw new Error("No principal to withdraw in this vault.");
  }

  const eth = await resolveEthereumProvider(wallets, ownerAddress);
  const owner = getAddress(ownerAddress);
  await ensureWalletOnChain(eth, holding.chainId);

  const data = await encodeWithdrawCalldata(eth, holding, owner);
  const txHash = await sendEvmTransaction(eth, {
    from: owner,
    to: holding.vaultAddress,
    data,
  });
  const receipt = await waitForTxReceipt(eth, txHash);
  if (receipt.status !== "0x1") {
    throw new Error("Withdraw transaction failed on-chain.");
  }
  return txHash;
}
