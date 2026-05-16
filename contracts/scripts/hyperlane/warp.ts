import { Contract, ethers } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const ROUTER_ABI = [
  "function token() view returns (address)",
  "function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32)",
];

export function addressToBytes32(addr: string): string {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

export async function routerToken(router: string, provider: ethers.Provider): Promise<string> {
  const c = new Contract(router, ROUTER_ABI, provider);
  const token: string = await c.token();
  return ethers.getAddress(token);
}

export async function transferRemote(params: {
  signer: ethers.Signer;
  router: string;
  destinationDomain: number;
  recipient: string;
  amount: bigint;
  interchainGasWei?: bigint;
}): Promise<{ messageId: string }> {
  const { signer, router, destinationDomain, recipient, amount } = params;
  const interchainGasWei = params.interchainGasWei ?? 0n;
  const provider = signer.provider!;
  const tokenAddr = await routerToken(router, provider);
  const walletAddr = await signer.getAddress();

  const token = new Contract(tokenAddr, ERC20_ABI, signer);
  const r = new Contract(router, ROUTER_ABI, signer);

  const allowance: bigint = await token.allowance(walletAddr, router);
  if (allowance < amount) {
    const tx = await token.approve(router, amount);
    await tx.wait();
  }

  const tx = await r.transferRemote(destinationDomain, addressToBytes32(recipient), amount, {
    value: interchainGasWei,
  });
  const receipt = await tx.wait();
  return { txHash: receipt?.hash ?? tx.hash };
}

export async function erc20Balance(
  tokenAddress: string,
  holder: string,
  provider: ethers.Provider,
): Promise<bigint> {
  const t = new Contract(tokenAddress, ERC20_ABI, provider);
  return (await t.balanceOf(holder)) as bigint;
}
