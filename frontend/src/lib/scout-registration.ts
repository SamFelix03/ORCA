"use client";

import type { ScoutRegistrationChallengeResponse } from "@orca/shared";
import { BrowserProvider, getAddress, Interface, keccak256, toUtf8Bytes, verifyTypedData } from "ethers";

/** Must match api/src/lib/byoScoutRegistration.ts SCOUT_REGISTRATION_TYPES (exclude EIP712Domain). */
export const SCOUT_REGISTRATION_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  ScoutRegistration: [
    { name: "did", type: "string" },
    { name: "didHash", type: "bytes32" },
    { name: "vault", type: "address" },
    { name: "bondAmountWei", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

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

export function buildScoutRegistrationDomain(challenge: ScoutRegistrationChallengeResponse) {
  return {
    name: challenge.domain.name,
    version: challenge.domain.version,
    chainId: challenge.domain.chainId,
  };
}

/** Message shape must match API verifyTypedData (uint256 fields as bigint). */
export function buildScoutRegistrationMessage(
  challenge: ScoutRegistrationChallengeResponse,
  params: { did: string; didHashHex: string; vault: string; bondAmountWei: bigint },
) {
  return {
    did: params.did.trim(),
    didHash: params.didHashHex,
    vault: getAddress(params.vault.trim()),
    bondAmountWei: params.bondAmountWei,
    nonce: challenge.nonce,
    deadline: BigInt(challenge.deadline),
  };
}

export async function signScoutRegistrationTypedData(
  eth: InjectedEthereum,
  ownerAddress: string,
  challenge: ScoutRegistrationChallengeResponse,
  params: { did: string; didHashHex: string; vault: string; bondAmountWei: bigint },
): Promise<string> {
  const expected = getAddress(ownerAddress);
  const domain = buildScoutRegistrationDomain(challenge);
  const message = buildScoutRegistrationMessage(challenge, params);
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const signerAddress = getAddress(await signer.getAddress());
  if (signerAddress !== expected) {
    throw new Error(
      `Wallet signer is ${signerAddress}, expected ${expected}. Reconnect Privy and retry registration.`,
    );
  }
  const signature = await signer.signTypedData(domain, SCOUT_REGISTRATION_TYPES, message);
  const recovered = verifyTypedData(domain, SCOUT_REGISTRATION_TYPES, message, signature);
  if (getAddress(recovered) !== expected) {
    throw new Error(
      `Signature verification failed locally (recovered ${recovered}). Try again or contact support.`,
    );
  }
  return signature;
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
