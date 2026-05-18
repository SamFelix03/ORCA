import "../../scripts/lib/load-contracts-env.js";
import { JsonRpcProvider, Wallet } from "ethers";
import { loadRelayerConfig } from "./config.js";
import { deliverMessage, fetchMessageFromDispatchTx, isDelivered } from "./deliver.js";
import { messageIdFromBytes } from "./message.js";
import { metadataForMessage, resolveIsm } from "./ism.js";
import { recipientAddressFromBytes32 } from "./message.js";
import { processPendingDispatches } from "./watch.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const cfg = loadRelayerConfig();
  const messageId = argValue("--message-id") ?? process.env.MESSAGE_ID?.trim();
  const dispatchTx = argValue("--dispatch-tx") ?? process.env.DISPATCH_TX?.trim() ?? process.env.KITE_WARP_TX?.trim();

  if (dispatchTx) {
    const origin = new JsonRpcProvider(cfg.origin.rpc);
    const { messageBytes, messageId: mid, destination, recipient } = await fetchMessageFromDispatchTx(
      origin,
      cfg.origin.mailbox,
      dispatchTx,
    );
    const dest = cfg.destinations.get(destination);
    if (!dest) throw new Error(`unknown destination domain ${destination}`);
    const recipientAddr = recipientAddressFromBytes32(recipient);
    const destProvider = new JsonRpcProvider(dest.rpc);
    if (await isDelivered(dest.mailbox, mid, destProvider)) {
      console.log(JSON.stringify({ delivered: true, messageId: mid }, null, 2));
      return;
    }
    const ism = await resolveIsm(dest.mailbox, recipientAddr, destProvider);
    const metadata = await metadataForMessage(ism, messageBytes, destProvider);
    const wallet = new Wallet(cfg.privateKey, destProvider);
    const { txHash } = await deliverMessage({
      destMailbox: dest.mailbox,
      messageBytes,
      metadata,
      signer: wallet,
    });
    console.log(JSON.stringify({ delivered: true, messageId: mid, txHash, destination: dest.name }, null, 2));
    return;
  }

  if (messageId) {
    await processPendingDispatches(cfg, messageId);
    const dest = [...cfg.destinations.values()][0];
    if (dest) {
      const ok = await isDelivered(dest.mailbox, messageId, new JsonRpcProvider(dest.rpc));
      console.log(JSON.stringify({ messageId, delivered: ok }, null, 2));
      process.exitCode = ok ? 0 : 2;
    }
    return;
  }

  await processPendingDispatches(cfg);
  console.log(JSON.stringify({ ok: true, mode: "scan-all-pending" }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
