/**
 * End-to-end: (1) optional Hyperlane trust wire, (2) optional **USDT** warp Kite→spoke (faucet USDT `0x0fF539…`; not PIEUSD),
 * (3) ClientAgentVault.execute → ORCAOApp.dispatch, (4) poll Sepolia RemoteAdapter for RemoteRebalanceExecuted.
 *
 *   cd contracts
 *   pnpm e2e:orca-sepolia
 *
 * Env (contracts/.env): PRIVATE_KEY or DEPLOYER_PRIVATE_KEY (executor / deployer EOA).
 * Optional: E2E_SKIP_WIRE=1  E2E_SKIP_WARP=1  E2E_POLL_SEC=360
 * Spoke pull: set E2E_SPOKE_BENEFICIARY to an EOA you control on Sepolia (default: hub `owner` from
 * kite-testnet.latest.json). The hub vault address often has no contract on Sepolia — use `pnpm prepare:sepolia-e2e`.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { attemptHyperlaneRelay, messageIdFromReceipt } from "./hyperlane/delivery";

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const KITE_RPC = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const KITE_CHAIN = 2368;
const SEPOLIA_DOMAIN = 11155111;

const OAPP_IFACE = new ethers.Interface([
  "function executeCrossChainRebalance(uint32 dstDomain,bytes32 destinationAdapter,address fromProtocol,address toProtocol,address beneficiary,uint256 amount,bytes hookMetadata) payable",
  "function quoteCrossChainRebalanceDispatchFee(address vaultCaller,uint32 dstDomain,bytes32 destinationAdapter,address fromProtocol,address toProtocol,address beneficiary,uint256 amount,bytes hookMetadata) view returns (uint256)",
]);
const VAULT_IFACE = new ethers.Interface([
  "function execute(address target,uint256 value,bytes data,uint256 amountForRule) payable returns (bytes)",
]);
const RA_IFACE = new ethers.Interface([
  "event RemoteRebalanceExecuted(bytes32 indexed messageId, uint32 indexed sourceDomain, address indexed toProtocol, address fromProtocol, address beneficiary, uint256 amountUsdc)",
]);

type HubArtifact = {
  owner?: string;
  deployer?: string;
  contracts: { ORCAOApp: string; ClientAgentVault: string };
};
type SpokeArtifact = {
  chainId: number;
  contracts: { RemoteAdapter: string };
};
type StubManifest = {
  stubsByChainId: Record<string, Record<string, string>>;
};

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const pk = process.env.PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) {
    throw new Error("Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in contracts/.env");
  }

  const skipWire = process.env.E2E_SKIP_WIRE === "1";
  const skipWarp = process.env.E2E_SKIP_WARP === "1";
  const pollSec = Number(process.env.E2E_POLL_SEC ?? "420");
  const pollIntervalMs = Number(process.env.E2E_POLL_INTERVAL_MS ?? "12000");

  const hubPath = path.join(ROOT, "deployments", "kite-testnet.latest.json");
  const hub = loadJson<HubArtifact>(hubPath);
  const oapp = ethers.getAddress(hub.contracts.ORCAOApp);
  const vault = ethers.getAddress(hub.contracts.ClientAgentVault);
  const defaultSpokeBeneficiary = ethers.getAddress(
    (process.env.E2E_SPOKE_BENEFICIARY?.trim() ||
      hub.owner ||
      hub.deployer ||
      "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844") as string,
  );

  const spokePath = path.join(ROOT, "deployments", "sepolia.spoke.json");
  const sepoliaSpoke = loadJson<SpokeArtifact>(spokePath);
  if (sepoliaSpoke.chainId !== SEPOLIA_DOMAIN) {
    throw new Error(`Expected sepolia.spoke.json chainId ${SEPOLIA_DOMAIN}`);
  }
  const remoteAdapter = ethers.getAddress(sepoliaSpoke.contracts.RemoteAdapter);
  const destAdapterB32 = ethers.zeroPadValue(remoteAdapter, 32);

  const manifestPath = path.join(REPO_ROOT, "agents", "config", "orca-stub-protocols.json");
  const manifest = loadJson<StubManifest>(manifestPath);
  const fromProtocol = ethers.getAddress(manifest.stubsByChainId["2368"]["aave-v3"]);
  const toProtocol = ethers.getAddress(manifest.stubsByChainId["11155111"]["morpho"]);
  const beneficiary = defaultSpokeBeneficiary;
  const amount = BigInt(process.env.E2E_OAPP_AMOUNT ?? "10000");
  const hookMeta = "0x";

  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify({ step: "config", oapp, vault, remoteAdapter, fromProtocol, toProtocol, beneficiary, amount: amount.toString() }, null, 2));

  if (!skipWire) {
    // eslint-disable-next-line no-console -- CLI
    console.log("--- Running hyperlane trust wire (subprocess) ---");
    execSync("pnpm exec hardhat run scripts/wire-hyperlane-trust.ts --network kiteTestnet", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env },
    });
  } else {
    // eslint-disable-next-line no-console -- CLI
    console.log("Skipping wire (E2E_SKIP_WIRE=1)");
  }

  if (!skipWarp) {
    // eslint-disable-next-line no-console -- CLI
    console.log("--- Optional warp Kite -> Sepolia (USDT); set AMOUNT if default fails ---");
    const warpAmount = process.env.E2E_WARP_AMOUNT ?? "1000000000000000000";
    try {
      execSync("pnpm exec hardhat run scripts/hyperlane/transfer-hub-to-dest.ts --network kiteTestnet", {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          HYP_DEST: "sepolia",
          HYP_WARP_ASSET: process.env.E2E_WARP_ASSET ?? "USDT",
          AMOUNT: warpAmount,
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console -- CLI
      console.warn("Warp step failed (non-fatal for ORCA dispatch test):", (e as Error).message ?? e);
    }
  } else {
    // eslint-disable-next-line no-console -- CLI
    console.log("Skipping warp (E2E_SKIP_WARP=1)");
  }

  const kiteProvider = new ethers.JsonRpcProvider(KITE_RPC);
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(pk, kiteProvider);

  // eslint-disable-next-line no-console -- CLI
  console.log("--- Quote Hyperlane dispatch fee ---");
  const quoteData = OAPP_IFACE.encodeFunctionData("quoteCrossChainRebalanceDispatchFee", [
    vault,
    SEPOLIA_DOMAIN,
    destAdapterB32,
    fromProtocol,
    toProtocol,
    beneficiary,
    amount,
    hookMeta,
  ]);
  const rawQuote = await kiteProvider.call({ to: oapp, data: quoteData });
  const fee = OAPP_IFACE.decodeFunctionResult("quoteCrossChainRebalanceDispatchFee", rawQuote)[0] as bigint;
  // eslint-disable-next-line no-console -- CLI
  console.log("quoted dispatch fee (wei):", fee.toString());

  const oappCalldata = OAPP_IFACE.encodeFunctionData("executeCrossChainRebalance", [
    SEPOLIA_DOMAIN,
    destAdapterB32,
    fromProtocol,
    toProtocol,
    beneficiary,
    amount,
    hookMeta,
  ]);
  const vaultCalldata = VAULT_IFACE.encodeFunctionData("execute", [oapp, fee, oappCalldata, amount]);

  const nonce = await kiteProvider.getTransactionCount(wallet.address, "pending");
  const txReq: ethers.TransactionRequest = {
    to: vault,
    data: vaultCalldata,
    value: fee,
    chainId: KITE_CHAIN,
    nonce,
    maxFeePerGas: ethers.parseUnits("2", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
  };
  const gas = await kiteProvider.estimateGas({ ...txReq, from: wallet.address });
  txReq.gasLimit = (gas * 110n) / 100n;

  // eslint-disable-next-line no-console -- CLI
  console.log("--- Submit vault.execute -> OApp ---");
  const sent = await wallet.sendTransaction(txReq);
  // eslint-disable-next-line no-console -- CLI
  console.log("vault tx:", sent.hash);
  const receipt = await sent.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Vault tx failed");
  }
  // eslint-disable-next-line no-console -- CLI
  console.log("vault tx mined in block", receipt.blockNumber);

  if (process.env.E2E_SKIP_RELAY !== "1") {
    const messageId = messageIdFromReceipt(receipt);
    // eslint-disable-next-line no-console -- CLI
    console.log("--- ORCA relayer deliver (OApp dispatch) ---", { messageId });
    const relay = attemptHyperlaneRelay({
      privateKey: pk,
      destinationChain: "sepolia",
      dispatchTx: sent.hash,
      messageId: messageId ?? undefined,
      timeoutSec: Number(process.env.RELAY_TIMEOUT_SEC ?? "180"),
    });
    // eslint-disable-next-line no-console -- CLI
    console.log("relayer:", relay.ok ? "ok" : relay.output.slice(-2000));
  }

  const ra = new ethers.Contract(remoteAdapter, RA_IFACE, sepoliaProvider);
  const startBlock = await sepoliaProvider.getBlockNumber();
  // eslint-disable-next-line no-console -- CLI
  console.log(`--- Poll Sepolia RemoteAdapter ${remoteAdapter} up to ${pollSec}s (from block ~${startBlock - 5}) ---`);

  const deadline = Date.now() + pollSec * 1000;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const to = await sepoliaProvider.getBlockNumber();
    const from = startBlock > 10 ? startBlock - 10 : 0;
    const ev = await ra.queryFilter(ra.filters.RemoteRebalanceExecuted(), from, to);
    if (ev.length > 0) {
      const last = ev[ev.length - 1];
      // eslint-disable-next-line no-console -- CLI
      console.log(
        JSON.stringify(
          {
            ok: true,
            messageId: last.args.messageId,
            sourceDomain: last.args.sourceDomain,
            toProtocol: last.args.toProtocol,
            beneficiary: last.args.beneficiary,
            amountUsdc: last.args.amountUsdc.toString(),
            txHash: last.transactionHash,
            blockNumber: last.blockNumber,
          },
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ),
      );
      return;
    }
    // eslint-disable-next-line no-console -- CLI
    console.log(`poll… sepolia block ${to}, no RemoteRebalanceExecuted yet`);
  }

  // eslint-disable-next-line no-console -- CLI
  console.warn(
    JSON.stringify(
      {
        ok: false,
        hint:
          "No RemoteRebalanceExecuted within window. Hyperlane relayer may be slow, or beneficiary lacks Sepolia collateral balance/approve for RemoteAdapter.transferFrom.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
