/**
 * Shared Hyperlane delivery checks + in-repo relay (mailbox.process).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import type { Provider, Signer, TransactionReceipt } from "ethers";
import { Contract, ethers } from "ethers";

/** Hyperlane CLI `-r` root: directory containing `chains/<name>/metadata.yaml`. */
const REPO_REGISTRY = path.resolve(__dirname, "..", "..", "..", "hyperlane");
const RELAYER_DIR = path.resolve(__dirname, "..", "..", "relayer");

export const DISPATCH_ID_TOPIC0 = "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a";

const MAILBOX_ABI = [
  "function delivered(bytes32 messageId) external view returns (bool)",
  "function process(bytes calldata metadata, bytes calldata message) external payable",
  "function defaultIsm() external view returns (address)",
  "function recipientIsm(address recipient) external view returns (address)",
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
];

const ISM_ABI = [
  "function moduleType() external view returns (uint8)",
  "function verify(bytes calldata metadata, bytes calldata message) external returns (bool)",
];

let _processIdTopic: string | undefined;
/** keccak256("ProcessId(bytes32)") */
export function processIdTopic0(): string {
  if (!_processIdTopic) {
    _processIdTopic = ethers.id("ProcessId(bytes32)");
  }
  return _processIdTopic;
}

export function messageIdFromReceipt(receipt: TransactionReceipt): string | undefined {
  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() === DISPATCH_ID_TOPIC0.toLowerCase() && log.topics[1]) {
      return log.topics[1];
    }
  }
  return undefined;
}

export async function messageIdFromTxHash(provider: Provider, txHash: string): Promise<string | undefined> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return undefined;
  return messageIdFromReceipt(receipt);
}

export async function messageBytesFromDispatchTx(
  provider: Provider,
  mailbox: string,
  dispatchTx: string,
): Promise<{ messageBytes: string; messageId: string; destination: number }> {
  const receipt = await provider.getTransactionReceipt(dispatchTx);
  if (!receipt) throw new Error(`receipt not found: ${dispatchTx}`);
  const mb = new Contract(mailbox, MAILBOX_ABI, provider);
  const dispatchTopic = ethers.id("Dispatch(address,uint32,bytes32,bytes)");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== mailbox.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== dispatchTopic.toLowerCase()) continue;
    const parsed = mb.interface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) continue;
    const messageBytes = parsed.args.message as string;
    return {
      messageBytes,
      messageId: ethers.keccak256(messageBytes),
      destination: Number(parsed.args.destination),
    };
  }
  throw new Error(`no Dispatch log in ${dispatchTx}`);
}

const MAX_LOG_RANGE = 40_000;

export async function isMessageProcessedOnDest(
  destMailbox: string,
  messageId: string,
  destProvider: Provider,
  fromBlock: number,
): Promise<{ found: boolean; txHash?: string }> {
  const toBlock = await destProvider.getBlockNumber();
  let start = Math.max(0, fromBlock);
  const topic0 = processIdTopic0();

  while (start <= toBlock) {
    const end = Math.min(start + MAX_LOG_RANGE - 1, toBlock);
    const logs = await destProvider.getLogs({
      address: destMailbox,
      topics: [topic0, messageId],
      fromBlock: start,
      toBlock: end,
    });
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      return { found: true, txHash: last.transactionHash };
    }
    start = end + 1;
  }
  return { found: false };
}

export async function resolveRecipientIsm(
  mailbox: string,
  recipient: string,
  provider: Provider,
): Promise<string> {
  const mb = new Contract(mailbox, MAILBOX_ABI, provider);
  const recipientIsm: string = await mb.recipientIsm(recipient);
  if (recipientIsm && recipientIsm !== ethers.ZeroAddress) return recipientIsm;
  return mb.defaultIsm();
}

export async function metadataForIsm(
  ismAddress: string,
  messageBytes: string,
  provider: Provider,
): Promise<string> {
  const ism = new Contract(ismAddress, ISM_ABI, provider);
  let moduleType = 0;
  try {
    moduleType = Number(await ism.moduleType());
  } catch {
    moduleType = 0;
  }
  if (moduleType === 6) return "0x";
  try {
    if (await ism.verify.staticCall("0x", messageBytes)) return "0x";
  } catch {
    /* */
  }
  const padded = "0x" + "00".repeat(32);
  if (await ism.verify.staticCall(padded, messageBytes)) return padded;
  throw new Error(`ISM ${ismAddress} rejected empty metadata`);
}

export type InRepoDeliverParams = {
  destMailbox: string;
  messageBytes: string;
  recipient: string;
  destProvider: Provider;
  signer: Signer;
};

export async function deliverMessageInRepo(params: InRepoDeliverParams): Promise<string> {
  const ism = await resolveRecipientIsm(params.destMailbox, params.recipient, params.destProvider);
  const metadata = await metadataForIsm(ism, params.messageBytes, params.destProvider);
  const mb = new Contract(params.destMailbox, MAILBOX_ABI, params.signer);
  const tx = await mb.process(metadata, params.messageBytes);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("process tx failed");
  return receipt.hash;
}

/** Map snapshot dest keys → Hyperlane registry chain names. */
export const DEST_KEY_TO_HYP_CHAIN: Record<string, string> = {
  sepolia: "sepolia",
  arbitrumsepolia: "arbitrumsepolia",
  optimismsepolia: "optimismsepolia",
  basesepolia: "basesepolia",
};

export type RelayAttemptParams = {
  privateKey: string;
  originChain?: string;
  destinationChain: string;
  messageId?: string;
  dispatchTx?: string;
  timeoutSec?: number;
  registryPaths?: string[];
};

/**
 * Deliver via in-repo ORCA relayer (`contracts/relayer`).
 * @deprecated CLI relay — use deliverMessageInRepo or relayer:once
 */
export function attemptHyperlaneRelay(params: RelayAttemptParams): { ok: boolean; output: string } {
  const env = { ...process.env };
  if (params.messageId) env.MESSAGE_ID = params.messageId;
  if (params.dispatchTx) env.DISPATCH_TX = params.dispatchTx;
  if (params.privateKey) {
    env.RELAYER_PRIVATE_KEY = params.privateKey.startsWith("0x")
      ? params.privateKey
      : `0x${params.privateKey}`;
  }
  try {
    const args = params.dispatchTx
      ? `once -- --dispatch-tx ${params.dispatchTx}`
      : params.messageId
        ? `once -- --message-id ${params.messageId}`
        : "once";
    const output = execSync(`pnpm ${args}`, {
      cwd: RELAYER_DIR,
      env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: ((params.timeoutSec ?? 180) + 30) * 1000,
    });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
    return { ok: false, output };
  }
}

export { REPO_REGISTRY };
