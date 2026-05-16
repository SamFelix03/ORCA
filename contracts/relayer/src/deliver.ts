import { Contract, Wallet, ethers, type Provider } from "ethers";

export { ethers };

const MAILBOX_ABI = [
  "function delivered(bytes32 messageId) external view returns (bool)",
  "function process(bytes calldata metadata, bytes calldata message) external payable",
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
];

export async function isDelivered(
  mailbox: string,
  messageId: string,
  provider: Provider,
): Promise<boolean> {
  const mb = new Contract(mailbox, MAILBOX_ABI, provider);
  return mb.delivered(messageId);
}

export async function findProcessTx(
  mailbox: string,
  messageId: string,
  provider: Provider,
  fromBlock: number,
  chunk = 40_000,
): Promise<string | undefined> {
  const topic0 = ethers.id("ProcessId(bytes32)");
  const head = await provider.getBlockNumber();
  let start = Math.max(0, fromBlock);
  while (start <= head) {
    const end = Math.min(start + chunk - 1, head);
    const logs = await provider.getLogs({
      address: mailbox,
      topics: [topic0, messageId],
      fromBlock: start,
      toBlock: end,
    });
    if (logs.length > 0) {
      return logs[logs.length - 1]!.transactionHash;
    }
    start = end + 1;
  }
  return undefined;
}

export type DeliverParams = {
  destMailbox: string;
  messageBytes: string;
  metadata: string;
  signer?: Wallet;
  provider?: Provider;
  simulate?: boolean;
};

export async function deliverMessage(params: DeliverParams): Promise<{ txHash?: string; simulated: boolean }> {
  const runner = params.signer ?? params.provider;
  if (!runner) throw new Error("deliverMessage: signer or provider required");
  const mb = new Contract(params.destMailbox, MAILBOX_ABI, runner);
  if (params.simulate) {
    await mb.process.staticCall(params.metadata, params.messageBytes);
    return { simulated: true };
  }
  if (!params.signer) throw new Error("deliverMessage: signer required for submit");
  const tx = await mb.process(params.metadata, params.messageBytes);
  const receipt = await tx.wait();
  return { txHash: receipt?.hash, simulated: false };
}

export async function fetchMessageFromDispatchTx(
  originProvider: Provider,
  mailbox: string,
  dispatchTx: string,
): Promise<{ messageBytes: string; messageId: string; destination: number; recipient: string }> {
  const receipt = await originProvider.getTransactionReceipt(dispatchTx);
  if (!receipt) throw new Error(`receipt not found: ${dispatchTx}`);
  const mb = new Contract(mailbox, MAILBOX_ABI, originProvider);
  const topic0 = ethers.id("Dispatch(address,uint32,bytes32,bytes)");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== mailbox.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== topic0.toLowerCase()) continue;
    const parsed = mb.interface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) continue;
    const messageBytes = parsed.args.message as string;
    const destination = Number(parsed.args.destination);
    const recipient = parsed.args.recipient as string;
    return {
      messageBytes,
      messageId: ethers.keccak256(messageBytes),
      destination,
      recipient,
    };
  }
  throw new Error(`no Dispatch log in tx ${dispatchTx}`);
}
