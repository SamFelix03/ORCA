import { ethers } from "hardhat";

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
  /** @see https://docs.hyperlane.xyz/docs/applications/warp-routes/interface — native fee = quotes[0] (token address(0)), pull = quotes[1] for collateral */
  "function quoteTransferRemote(uint32 destination, bytes32 recipient, uint256 amount) view returns (tuple(address token, uint256 amount)[] memory)",
];

export function addressToBytes32(addr: string): string {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

export async function routerToken(router: string, provider: ethers.Provider): Promise<string> {
  const c = new ethers.Contract(router, ROUTER_ABI, provider);
  const token: string = await c.token();
  return ethers.getAddress(token);
}

export async function transferRemote(params: {
  signer: ethers.Signer;
  router: string;
  destinationDomain: number;
  recipient: string;
  /** Added on top of quoted native fee (usually 0 — prefer letting quote set msg.value). */
  interchainGasWei?: bigint;
  /** Transfer amount: exact amount out for recipient on dest (per HWR semantics). */
  amount: bigint;
}): Promise<{ txHash: string }> {
  const { signer, router, destinationDomain, recipient, amount } = params;
  const interchainGasWei = params.interchainGasWei ?? 0n;
  const provider = signer.provider!;
  const tokenAddr = await routerToken(router, provider);
  const walletAddr = await signer.getAddress();
  const recipientB32 = addressToBytes32(recipient);

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
  const r = new ethers.Contract(router, ROUTER_ABI, signer);

  let valueWithQuote = interchainGasWei;
  let approvalAmount = amount;

  try {
    const quotes = (await r.quoteTransferRemote(
      destinationDomain,
      recipientB32,
      amount,
    )) as Array<{ token: string; amount: bigint }>;
    let nativeFee = 0n;
    let tokenNeed = amount;
    for (const q of quotes) {
      if (q.token.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
        nativeFee += q.amount;
      } else if (ethers.getAddress(q.token) === ethers.getAddress(tokenAddr)) {
        if (q.amount > tokenNeed) {
          tokenNeed = q.amount;
        }
      }
    }
    valueWithQuote = nativeFee + interchainGasWei;
    approvalAmount = tokenNeed;
  } catch {
    /* Older routers without quoteTransferRemote — keep legacy behavior */
  }

  const allowance: bigint = await token.allowance(walletAddr, router);
  if (allowance < approvalAmount) {
    const tx = await token.approve(router, approvalAmount);
    await tx.wait();
  }

  const tx = await r.transferRemote(destinationDomain, recipientB32, amount, {
    value: valueWithQuote,
  });
  const receipt = await tx.wait();
  return { txHash: receipt?.hash ?? tx.hash };
}

export async function erc20Balance(
  tokenAddress: string,
  holder: string,
  provider: ethers.Provider,
): Promise<bigint> {
  const t = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return (await t.balanceOf(holder)) as bigint;
}
