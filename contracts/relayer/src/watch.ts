import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { RelayerConfig } from "./config.js";
import { DISPATCH_ID_TOPIC0 } from "./config.js";
import { decodeMessage, messageIdFromBytes, normalizeRecipientBytes32, recipientAddressFromBytes32 } from "./message.js";
import { deliverMessage, isDelivered } from "./deliver.js";
import { metadataForMessage, resolveIsm } from "./ism.js";

const DISPATCH_ABI = [
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
];

type State = { lastScannedBlock: number };

async function postRelayerEvent(payload: Record<string, unknown>): Promise<void> {
  const base = process.env.ORCA_API_BASE_URL?.trim();
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/internal/relayer-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[relayer-api-fail] ${msg}`);
  }
}

function loadState(path: string): State {
  if (!fs.existsSync(path)) return { lastScannedBlock: 0 };
  return JSON.parse(fs.readFileSync(path, "utf8")) as State;
}

function saveState(filePath: string, state: State): void {
  const dir = path.dirname(filePath);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export async function processPendingDispatches(cfg: RelayerConfig, singleMessageId?: string): Promise<void> {
  const origin = new JsonRpcProvider(cfg.origin.rpc);
  const mb = new Contract(cfg.origin.mailbox, DISPATCH_ABI, origin);
  const head = await origin.getBlockNumber();
  const state = loadState(cfg.statePath);
  const fromBlock =
    singleMessageId != null
      ? Math.max(0, head - Number(process.env.RELAYER_LOOKBACK_BLOCKS ?? "500000"))
      : state.lastScannedBlock > 0
        ? state.lastScannedBlock
        : Math.max(0, head - Number(process.env.RELAYER_BOOTSTRAP_BLOCKS ?? "5000"));

  const destDomains = new Set(cfg.destinations.keys());
  const events: Array<{ messageBytes: string; destination: number; recipient: string; dispatchTxHash: string }> = [];

  let start = fromBlock;
  while (start <= head) {
    const end = Math.min(start + cfg.scanChunk - 1, head);
    const filter = mb.filters.Dispatch();
    const chunk = await mb.queryFilter(filter, start, end);
    for (const ev of chunk) {
      if (!("args" in ev) || !ev.args) continue;
      const destination = Number(ev.args.destination);
      const recipient = (ev.args.recipient as string).toLowerCase();
      if (!destDomains.has(destination)) continue;
      if (!cfg.allowlistedRecipients.has(recipient)) continue;
      const messageBytes = ev.args.message as string;
      const messageId = messageIdFromBytes(messageBytes);
      if (singleMessageId && messageId.toLowerCase() !== singleMessageId.toLowerCase()) continue;
      events.push({ messageBytes, destination, recipient, dispatchTxHash: ev.transactionHash });
    }
    start = end + 1;
  }

  if (!singleMessageId) {
    saveState(cfg.statePath, { lastScannedBlock: head + 1 });
  }

  for (const ev of events) {
    const dest = cfg.destinations.get(ev.destination);
    if (!dest) continue;

    const messageId = messageIdFromBytes(ev.messageBytes);
    const destProvider = new JsonRpcProvider(dest.rpc);
    if (await isDelivered(dest.mailbox, messageId, destProvider)) {
      console.log(`[skip] ${messageId.slice(0, 18)}… already delivered on ${dest.name}`);
      continue;
    }

    const recipientAddr = recipientAddressFromBytes32(ev.recipient);
    let metadata = "0x";
    try {
      const ism = await resolveIsm(dest.mailbox, recipientAddr, destProvider);
      metadata = await metadataForMessage(ism, ev.messageBytes, destProvider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ism-fail] ${dest.name} ${messageId.slice(0, 18)}… ${msg}`);
      continue;
    }

    const wallet = new Wallet(cfg.privateKey, destProvider);
    try {
      const { txHash } = await deliverMessage({
        destMailbox: dest.mailbox,
        messageBytes: ev.messageBytes,
        metadata,
        signer: wallet,
      });
      const decoded = decodeMessage(ev.messageBytes);
      console.log(
        `[delivered] ${dest.name} ${messageId.slice(0, 18)}… tx=${txHash} origin=${decoded.origin} recipient=${recipientAddr}`,
      );
      await postRelayerEvent({
        messageId,
        originDomain: decoded.origin,
        destinationDomain: ev.destination,
        recipient: recipientAddr,
        dispatchTxHash: ev.dispatchTxHash,
        deliveryTxHash: txHash,
        status: "delivered",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[deliver-fail] ${dest.name} ${messageId.slice(0, 18)}… ${msg}`);
    }
  }
}
