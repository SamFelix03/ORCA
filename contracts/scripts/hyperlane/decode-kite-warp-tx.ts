/**
 * Decode a kitetestnet HypCollateral `transferRemote` tx: confirms origin-side events and
 * extracts **DispatchId** → Hyperlane message id (for delivery debugging / self-relay).
 *
 *   cd contracts
 *   KITE_WARP_TX=0x... pnpm exec hardhat run scripts/hyperlane/decode-kite-warp-tx.ts --network kiteTestnet
 *
 * @see https://docs.hyperlane.xyz/docs/resources/message-debugging
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

/** `DispatchId(bytes32 indexed messageId)` — Hyperlane docs topic0 for message id on origin tx. */
const DISPATCH_ID_TOPIC0 = "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a";

/** `Dispatch(address indexed,uint32 indexed,bytes32 indexed,bytes)` — mailbox outbound (recipient is often dest router as bytes32). */
const DISPATCH_IFACE = new ethers.Interface([
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
]);

/** `SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)` */
const SENT_REMOTE_IFACE = new ethers.Interface([
  "event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)",
]);

async function main(): Promise<void> {
  const txHash =
    process.env.KITE_WARP_TX?.trim() ||
    process.argv.slice(2).find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
  if (!txHash) {
    throw new Error("Set KITE_WARP_TX or pass tx hash as first argument");
  }

  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`No receipt for ${txHash}`);
  }

  const mailboxFromSnapshot = (() => {
    try {
      const snapPath = path.join(
        ROOT,
        "..",
        "hyperlane",
        "outputs",
        "snapshots",
        "orca-integration.latest.json",
      );
      const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as { mailboxes?: Record<string, string> };
      return snap.mailboxes?.kitetestnet;
    } catch {
      return undefined;
    }
  })();

  let messageId: string | undefined;
  let dispatchParsed: { name: string; args: ReadonlyArray<{ toString(): string } | bigint | string> } | undefined;

  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() === DISPATCH_ID_TOPIC0.toLowerCase() && log.topics.length >= 2) {
      messageId = log.topics[1] as string;
    }
    try {
      const parsed = DISPATCH_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "Dispatch") {
        dispatchParsed = parsed;
      }
    } catch {
      /* not Dispatch */
    }
  }

  let sentRemote: { name: string; args: ReadonlyArray<{ toString(): string } | bigint | string> } | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = SENT_REMOTE_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "SentTransferRemote") {
        sentRemote = parsed;
      }
    } catch {
      /* */
    }
  }

  const sepoliaMailbox = "0xCDF3D9c1E132e4b37A362CF0f11f384b673Aa908";

  const mb = mailboxFromSnapshot?.toLowerCase();
  const mailboxLogCount = mb
    ? receipt.logs.filter((log: { address: string }) => log.address.toLowerCase() === mb).length
    : 0;

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        interpretation:
          receipt.status === 1
            ? "Origin tx succeeded: collateral pull + SentTransferRemote + Mailbox.dispatch (if present) are expected. Funds not on the spoke yet = delivery/relayer/mint path on DESTINATION, not a failed Kite tx."
            : "Origin tx failed — fix Kite side first.",
        kiteMailbox: mailboxFromSnapshot,
        logsFromKiteMailbox: mailboxLogCount,
        sentTransferRemote: sentRemote
          ? {
              destinationDomain: sentRemote.args[0].toString(),
              recipient: sentRemote.args[1],
              amountOrId: (sentRemote.args[2] as bigint).toString(),
            }
          : null,
        mailboxDispatch: dispatchParsed
          ? {
              sender: dispatchParsed.args[0],
              destinationDomain: dispatchParsed.args[1].toString(),
              recipientBytes32: dispatchParsed.args[2],
            }
          : null,
        messageIdFromDispatchIdLog: messageId ?? null,
        destinationChecks: {
          sepoliaMailbox,
          hint:
            "On Sepolia Etherscan: search txs **to** this mailbox that **Process** your message, or watch your recipient’s **synthetic USDT** token transfers. Public Hyperlane Explorer often does **not** index Kite.",
        },
        selfRelayCliHint:
          messageId &&
          "hyperlane status --relay --origin <kitetestnet-registry-name> --destination sepolia --id " + messageId,
        docs: "https://docs.hyperlane.xyz/docs/resources/message-debugging",
      },
      null,
      2,
    ),
  );

  if (!messageId) {
    // eslint-disable-next-line no-console -- CLI
    console.warn(
      "\nNo DispatchId log found (topic0",
      DISPATCH_ID_TOPIC0 + ").",
      "Expand **all** logs on Kitescan — some deploys emit only Dispatch; message id may be derivable from message bytes or a later log.\n",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
