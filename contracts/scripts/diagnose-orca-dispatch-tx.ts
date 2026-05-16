/**
 * Decode a ClientAgentVault → ORCAOApp tx on Kite: proves Mailbox.dispatch was requested
 * and prints `dispatchId` (Hyperlane message id) for explorers / relayer debugging.
 *
 *   cd contracts
 *   VAULT_TX_HASH=0x... pnpm diagnose:orca-dispatch
 *
 * Reads `deployments/kite-testnet.latest.json` for ORCAOApp + mailbox. No private key.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "ethers";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const KITE_RPC = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";

const OAPP_IFACE = new ethers.Interface([
  "event CrossChainRebalanceRequested(uint32 indexed dstDomain,address indexed fromProtocol,address indexed toProtocol,uint256 amount,bytes32 destinationAdapter,bytes32 transferId,bytes32 dispatchId,bytes payload)",
]);

/** Hyperlane mailbox `Dispatch` (v3-style; OApp `dispatchId` matches `messageId` here). */
const MAILBOX_IFACE = new ethers.Interface([
  "event Dispatch(bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 indexed messageNonce,bytes message)",
]);

type HubArtifact = {
  contracts: { ORCAOApp: string };
  configs: { mailboxAddress: string; localDomain: string };
};

function loadHub(): HubArtifact {
  const p = path.join(ROOT, "deployments", "kite-testnet.latest.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as HubArtifact;
}

async function main(): Promise<void> {
  const txHash =
    process.env.VAULT_TX_HASH?.trim() ||
    process.argv.slice(2).find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
  if (!txHash) {
    throw new Error("Set VAULT_TX_HASH or pass tx hash as first argument");
  }

  const hub = loadHub();
  const oapp = ethers.getAddress(hub.contracts.ORCAOApp);
  const mailbox = ethers.getAddress(hub.configs.mailboxAddress);

  const provider = new ethers.JsonRpcProvider(KITE_RPC);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`No receipt for ${txHash}`);
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        txHash: receipt.hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        kiteRpc: KITE_RPC,
        ORCAOApp: oapp,
        mailbox,
      },
      null,
      2,
    ),
  );

  let foundOapp = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== oapp.toLowerCase()) {
      continue;
    }
    try {
      const parsed = OAPP_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "CrossChainRebalanceRequested") {
        foundOapp = true;
        const a = parsed.args;
        // eslint-disable-next-line no-console -- CLI
        console.log(
          "\n--- CrossChainRebalanceRequested (source of truth for message id) ---\n",
          JSON.stringify(
            {
              dstDomain: a.dstDomain.toString(),
              fromProtocol: a.fromProtocol,
              toProtocol: a.toProtocol,
              amount: a.amount.toString(),
              destinationAdapter: a.destinationAdapter,
              transferId: a.transferId,
              dispatchId: a.dispatchId,
              payloadLen: (a.payload as string).length,
            },
            null,
            2,
          ),
        );
        // eslint-disable-next-line no-console -- CLI
        console.log(
          "\nNext steps:\n" +
            `  • Paste dispatchId into Hyperlane explorers (search by message id): https://hyperlane.xyz/\n` +
            `  • If dispatchId looks valid but Sepolia never shows handle: a relayer must submit delivery, or handle() reverts (e.g. collateral / approve on beneficiary).\n`,
        );
      }
    } catch {
      /* not this event */
    }
  }

  if (!foundOapp) {
    // eslint-disable-next-line no-console -- CLI
    console.warn("No CrossChainRebalanceRequested log from ORCAOApp — tx may have reverted before dispatch or used wrong address.");
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== mailbox.toLowerCase()) {
      continue;
    }
    try {
      const parsed = MAILBOX_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "Dispatch") {
        const o = parsed.args.toObject();
        // eslint-disable-next-line no-console -- CLI
        console.log("\n--- Mailbox Dispatch ---\n", JSON.stringify({ ...o, destinationDomain: o.destinationDomain.toString(), messageNonce: o.messageNonce.toString() }, null, 2));
      }
    } catch {
      /* different mailbox / version */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
