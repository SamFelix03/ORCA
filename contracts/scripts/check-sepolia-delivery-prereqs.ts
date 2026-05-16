/**
 * On Sepolia: beneficiary (ClientAgentVault) USDT balance + allowance to RemoteAdapter,
 * whether a message id was processed, and trustedSender(2368) vs ORCAOApp.
 *
 *   cd contracts && pnpm exec hardhat run scripts/check-sepolia-delivery-prereqs.ts --network sepolia
 *
 * Optional: MESSAGE_ID=0x... VAULT=0x...
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

type Hub = { contracts: { ORCAOApp: string; ClientAgentVault: string } };
type Spoke = { contracts: { RemoteAdapter: string }; underlying: { address: string } };

async function main(): Promise<void> {
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "kite-testnet.latest.json"), "utf8")) as Hub;
  const spoke = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "sepolia.spoke.json"), "utf8")) as Spoke;

  const vault = ethers.getAddress(process.env.VAULT?.trim() || hub.contracts.ClientAgentVault);
  const adapter = ethers.getAddress(spoke.contracts.RemoteAdapter);
  const usdt = ethers.getAddress(spoke.underlying.address);
  const oapp = ethers.getAddress(hub.contracts.ORCAOApp);
  const msgId =
    process.env.MESSAGE_ID?.trim() ||
    "0xcdf965df29d3725bd21e0c81d7cf057394bd7a6778abf207a6fd012a5070564e";

  const provider = ethers.provider;

  const erc20 = new ethers.Contract(
    usdt,
    ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"],
    provider,
  );
  const ra = new ethers.Contract(
    adapter,
    ["function processedMessageIds(bytes32) view returns (bool)", "function trustedSenders(uint32) view returns (bytes32)"],
    provider,
  );

  const [bal, allow, processed, ts] = await Promise.all([
    erc20.balanceOf(vault),
    erc20.allowance(vault, adapter),
    ra.processedMessageIds(msgId),
    ra.trustedSenders(2368),
  ]);

  const expectedTs = ethers.zeroPadValue(oapp, 32);
  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        vault,
        remoteAdapter: adapter,
        sepoliaUsdt: usdt,
        ORCAOAppOnHub: oapp,
        messageId: msgId,
        beneficiaryUsdtBalanceWei: bal.toString(),
        beneficiaryAllowanceToAdapterWei: allow.toString(),
        messageMarkedProcessedOnAdapter: processed,
        trustedSender2368: ts,
        trustedSenderMatchesPaddedOApp: ts === expectedTs,
        note:
          bal === 0n || allow === 0n
            ? "RemoteAdapter.handle will revert on transferFrom(beneficiary) until vault holds Sepolia USDT and approves RemoteAdapter."
            : "Sufficient balance/allowance for pull; if still no event, check Hyperlane relay / explorer for message delivery status.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
