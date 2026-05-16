/**
 * Diagnostics port of hyperlane/fix.md relay.js (ethers v6).
 */
import { Contract, JsonRpcProvider } from "ethers";
import { loadRelayerConfig } from "./config.js";
import { decodeMessage, messageIdFromBytes, recipientAddressFromBytes32 } from "./message.js";
import { deliverMessage, fetchMessageFromDispatchTx, isDelivered } from "./deliver.js";
import { metadataForMessage, resolveIsm } from "./ism.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

const MAILBOX_ABI = [
  "function defaultIsm() external view returns (address)",
  "function recipientIsm(address recipient) external view returns (address)",
  "function delivered(bytes32 messageId) external view returns (bool)",
];

const ISM_ABI = [
  "function moduleType() external view returns (uint8)",
  "function verify(bytes calldata metadata, bytes calldata message) external returns (bool)",
];

async function main(): Promise<void> {
  const cfg = loadRelayerConfig();
  const dispatchTx = argValue("--dispatch-tx") ?? process.env.DISPATCH_TX?.trim();
  if (!dispatchTx) throw new Error("Usage: inspect -- --dispatch-tx 0x...");

  const kite = new JsonRpcProvider(cfg.origin.rpc);
  const { messageBytes, messageId, destination, recipient } = await fetchMessageFromDispatchTx(
    kite,
    cfg.origin.mailbox,
    dispatchTx,
  );
  const dest = cfg.destinations.get(destination);
  if (!dest) throw new Error(`unknown dest domain ${destination}`);

  const sepolia = new JsonRpcProvider(dest.rpc);
  const recipientAddr = recipientAddressFromBytes32(recipient);
  const decoded = decodeMessage(messageBytes);

  console.log("messageId", messageId);
  console.log("decoded", decoded);
  console.log("delivered", await isDelivered(dest.mailbox, messageId, sepolia));

  const mb = new Contract(dest.mailbox, MAILBOX_ABI, sepolia);
  const defaultIsm = await mb.defaultIsm();
  const recipientIsm = await mb.recipientIsm(recipientAddr);
  console.log("defaultIsm", defaultIsm);
  console.log("recipientIsm", recipientIsm);

  const ismAddr = recipientIsm !== "0x0000000000000000000000000000000000000000" ? recipientIsm : defaultIsm;
  const ism = new Contract(ismAddr, ISM_ABI, sepolia);
  try {
    const mt = await ism.moduleType();
    console.log("moduleType", mt.toString());
  } catch (e) {
    console.log("moduleType error", e);
  }

  try {
    const meta = await metadataForMessage(ismAddr, messageBytes, sepolia);
    console.log("metadata chosen", meta);
    await deliverMessage({
      destMailbox: dest.mailbox,
      messageBytes,
      metadata: meta,
      provider: sepolia,
      simulate: true,
    });
    console.log("process simulation: OK");
  } catch (e) {
    console.log("process simulation FAIL", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
