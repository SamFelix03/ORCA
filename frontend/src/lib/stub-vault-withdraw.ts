"use client";

import type { VaultHoldingRecord } from "@orca/shared";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { getAddress, Interface, MaxUint256 } from "ethers";
import { sendEvmTransaction, waitForTxReceipt, type InjectedEthereum } from "@/lib/scout-registration";
import { ensureWalletOnChain, explorerTxUrl, resolveEthereumProvider } from "@/lib/wallet-provider";

export { explorerTxUrl, resolveEthereumProvider };

const vaultIface = new Interface([
  "function underlying() view returns (address)",
  "function withdraw()",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
]);

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
