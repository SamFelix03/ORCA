/**
 * Verify each spoke RemoteAdapter uses deployed NoopISM and process() simulates.
 *
 *   pnpm verify:spoke-ism
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Contract, JsonRpcProvider, ethers } from "ethers";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const KITE_RPC = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";
const KITE_MAILBOX = process.env.HYP_MAILBOX_KITE ?? "0x0d5b681C5887617d68200B45F3947c99Cf402188";

const RPC: Record<number, string> = {
  11155111: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  421614: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
  11155420: process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
  84532: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
};

const MAILBOX_ABI = [
  "function recipientIsm(address) view returns (address)",
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
];
const RA_ABI = ["function interchainSecurityModule() view returns (address)", "function ism() view returns (address)"];

async function main(): Promise<void> {
  const dir = path.join(ROOT, "deployments");
  const reports: unknown[] = [];
  const kite = new JsonRpcProvider(KITE_RPC);

  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".spoke.json")) continue;
    const spoke = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as {
      network: string;
      chainId: number;
      mailboxAddress: string;
      contracts: { RemoteAdapter: string; NoopISM?: string };
    };
    const rpc = RPC[spoke.chainId];
    if (!rpc) continue;

    const dest = new JsonRpcProvider(rpc);
    const ra = new Contract(spoke.contracts.RemoteAdapter, RA_ABI, dest);
    const mb = new Contract(spoke.mailboxAddress, MAILBOX_ABI, dest);

    let adapterIsm = "";
    let ismReadError: string | undefined;
    try {
      try {
        adapterIsm = await ra.interchainSecurityModule();
      } catch {
        adapterIsm = await ra.ism();
      }
    } catch (e) {
      ismReadError = e instanceof Error ? e.message.slice(0, 120) : String(e);
    }
    const mailboxIsm = await mb.recipientIsm(spoke.contracts.RemoteAdapter);
    const noopMatch =
      !!spoke.contracts.NoopISM &&
      !!adapterIsm &&
      adapterIsm.toLowerCase() === spoke.contracts.NoopISM.toLowerCase();

    const recipient32 = ethers.zeroPadValue(spoke.contracts.RemoteAdapter, 32);
    const head = await kite.getBlockNumber();
    const events = await new Contract(KITE_MAILBOX, MAILBOX_ABI, kite).queryFilter(
      "Dispatch",
      Math.max(0, head - 5000),
      head,
    );
    const sample = events.find(
      (e) =>
        "args" in e &&
        e.args &&
        Number(e.args.destination) === spoke.chainId &&
        (e.args.recipient as string).toLowerCase() === recipient32.toLowerCase(),
    );

    let processSim = "no_sample_message";
    if (sample && "args" in sample && sample.args) {
      const messageBytes = sample.args.message as string;
      const ism = new Contract(
        adapterIsm,
        ["function verify(bytes,bytes) view returns (bool)"],
        dest,
      );
      try {
        await ism.verify.staticCall("0x", messageBytes);
        const proc = new Contract(spoke.mailboxAddress, ["function process(bytes,bytes)"], dest);
        await proc.process.staticCall("0x", messageBytes);
        processSim = "ok";
      } catch (e) {
        processSim = e instanceof Error ? e.message.slice(0, 120) : String(e);
      }
    }

    reports.push({
      network: spoke.network,
      remoteAdapter: spoke.contracts.RemoteAdapter,
      noopIsm: spoke.contracts.NoopISM,
      adapterIsm: adapterIsm || null,
      ismReadError,
      mailboxRecipientIsm: mailboxIsm,
      noopMatchesArtifact: noopMatch,
      ismAligned: !!adapterIsm && adapterIsm.toLowerCase() === mailboxIsm.toLowerCase(),
      processSimulation: processSim,
      needsRedeploy: !spoke.contracts.NoopISM || !noopMatch,
    });
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(reports, null, 2));
  const allOk = (reports as Array<{ noopMatchesArtifact: boolean; ismAligned: boolean; needsRedeploy?: boolean }>).every(
    (r) => !r.needsRedeploy && r.noopMatchesArtifact && r.ismAligned,
  );
  process.exitCode = allOk ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
