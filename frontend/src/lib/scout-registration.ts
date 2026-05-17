"use client";

import type { ScoutRegistrationChallengeResponse } from "@orca/shared";
import { getAddress, Interface, keccak256, toUtf8Bytes } from "ethers";

export type InjectedEthereum = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function getInjectedEthereum(): InjectedEthereum | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: InjectedEthereum }).ethereum;
  return eth ?? null;
}

export function computeDidHashHex(did: string): string {
  return keccak256(toUtf8Bytes(did.trim()));
}

/** Approximate USDC → wei using integer math after rounding to stake decimals. */
export function bondWeiFromUsdc(usdc: number, decimals: number): bigint {
  const d = BigInt(decimals);
  const scale = BigInt(10) ** d;
  const rounded = BigInt(Math.round(usdc * Number(scale)));
  return rounded;
}

export function encodeErc20Approve(spender: string, amountWei: bigint): string {
  const iface = new Interface(["function approve(address spender,uint256 amount)"]);
  return iface.encodeFunctionData("approve", [getAddress(spender), amountWei]);
}

const allowanceIface = new Interface(["function allowance(address owner,address spender) view returns (uint256)"]);

export async function readErc20Allowance(
  eth: InjectedEthereum,
  tokenAddress: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  const data = allowanceIface.encodeFunctionData("allowance", [getAddress(owner), getAddress(spender)]);
  const raw = (await eth.request({
    method: "eth_call",
    params: [{ to: getAddress(tokenAddress), data }, "latest"],
  })) as string;
  const decoded = allowanceIface.decodeFunctionResult("allowance", raw);
  return decoded[0] as bigint;
}

export function buildTypedDataForSigning(
  challenge: ScoutRegistrationChallengeResponse,
  params: { did: string; didHashHex: string; vault: string; bondAmountWei: bigint },
) {
  const vault = getAddress(params.vault.trim());
  return {
    domain: challenge.domain,
    types: challenge.types,
    primaryType: challenge.primaryType,
    message: {
      did: params.did.trim(),
      didHash: params.didHashHex,
      vault,
      bondAmountWei: params.bondAmountWei.toString(),
      nonce: challenge.nonce,
      deadline: challenge.deadline.toString(),
    },
  };
}

/** Active wallet from the provider (avoids stale React state vs MetaMask account switch). */
export async function getConnectedAccount(eth: InjectedEthereum): Promise<string> {
  const accounts = (await eth.request({ method: "eth_accounts", params: [] })) as string[];
  if (!accounts?.length) {
    throw new Error("No wallet account connected. Click Connect wallet first.");
  }
  return getAddress(accounts[0]);
}

export async function signScoutRegistrationTypedData(
  eth: InjectedEthereum,
  account: string,
  challenge: ScoutRegistrationChallengeResponse,
  params: { did: string; didHashHex: string; vault: string; bondAmountWei: bigint },
): Promise<{ signature: string; ownerAddress: string }> {
  const signer = getAddress(account);
  const typedData = buildTypedDataForSigning(challenge, params);
  const signature = (await eth.request({
    method: "eth_signTypedData_v4",
    params: [signer, JSON.stringify(typedData)],
  })) as string;

  const { verifyTypedData } = await import("ethers");
  const recovered = verifyTypedData(
    typedData.domain,
    typedData.types,
    typedData.message,
    signature,
  );
  const ownerAddress = getAddress(recovered);
  if (ownerAddress.toLowerCase() !== signer.toLowerCase()) {
    throw new Error(
      `MetaMask signed as ${ownerAddress}, but the connected account is ${signer}. ` +
        "Switch to the correct account in MetaMask, click Connect wallet again, then retry.",
    );
  }
  return { signature, ownerAddress };
}

export async function sendEvmTransaction(
  eth: InjectedEthereum,
  tx: { from: string; to: string; data: string },
): Promise<string> {
  return (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from: getAddress(tx.from), to: getAddress(tx.to), data: tx.data }],
  })) as string;
}

export async function waitForTxReceipt(
  eth: InjectedEthereum,
  txHash: string,
  attempts = 45,
  delayMs = 2000,
): Promise<{ status?: string }> {
  for (let i = 0; i < attempts; i++) {
    const receipt = (await eth.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    })) as { status?: string } | null;
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

export function encodeErc20Transfer(to: string, amountWei: bigint): string {
  const iface = new Interface(["function transfer(address to,uint256 amount) returns (bool)"]);
  return iface.encodeFunctionData("transfer", [getAddress(to), amountWei]);
}

export async function ensureWalletChain(eth: InjectedEthereum, chainId: number): Promise<void> {
  const chainIdHex = `0x${BigInt(chainId).toString(16)}`;
  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainIdHex }],
  });
}
