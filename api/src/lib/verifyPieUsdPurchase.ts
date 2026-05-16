import { Interface, JsonRpcProvider, getAddress, type Log } from "ethers";
import { config } from "../config.js";

const transferIface = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export type VerifyPieUsdPurchaseInput = {
  txHash: string;
  expectedBuyer: string;
  expectedRecipient: string;
  expectedAmountWei: bigint;
};

function topicAddr(topic: string): string {
  return getAddress(`0x${topic.slice(-40)}`);
}

/**
 * Verifies that the receipt contains exactly one ERC-20 Transfer on `pieUsdAddress`
 * from buyer → recipient with value equal to `expectedAmountWei`, on the configured Kite chain.
 */
export async function verifyPieUsdPurchase(input: VerifyPieUsdPurchaseInput): Promise<void> {
  const provider = new JsonRpcProvider(config.kiteRpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.kiteChainId) {
    throw new Error(`RPC chainId ${network.chainId} does not match KITE_CHAIN_ID ${config.kiteChainId}`);
  }

  const receipt = await provider.getTransactionReceipt(input.txHash);
  if (!receipt) {
    throw new Error(`Transaction receipt not found for ${input.txHash}`);
  }
  if (receipt.status !== 1) {
    throw new Error(`Transaction ${input.txHash} did not succeed`);
  }

  const token = getAddress(config.pieUsdAddress);
  const buyer = getAddress(input.expectedBuyer);
  const recipient = getAddress(input.expectedRecipient);

  let matches = 0;
  for (const log of receipt.logs as Log[]) {
    if (!log.address || getAddress(log.address) !== token) {
      continue;
    }
    let parsed;
    try {
      parsed = transferIface.parseLog({ topics: log.topics as string[], data: log.data });
    } catch {
      continue;
    }
    if (parsed?.name !== "Transfer") {
      continue;
    }
    const from = topicAddr(String(log.topics[1]));
    const to = topicAddr(String(log.topics[2]));
    const value = parsed.args[2] as bigint;
    if (from === buyer && to === recipient && value === input.expectedAmountWei) {
      matches += 1;
    }
  }

  if (matches !== 1) {
    throw new Error(
      `Expected exactly one PIEUSD Transfer from ${buyer} to ${recipient} for ${input.expectedAmountWei.toString()} wei; found ${matches}`,
    );
  }

  // Touch token contract at log address to fail fast if address is not a contract
  const code = await provider.getCode(token);
  if (!code || code === "0x") {
    throw new Error(`PIEUSD token address ${token} has no contract code at this RPC`);
  }
}
