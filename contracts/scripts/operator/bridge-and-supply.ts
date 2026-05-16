import { ethers } from "hardhat";
import { runPrintBalances } from "../hyperlane/print-balances";
import { runTransferHubToDest } from "../hyperlane/transfer-hub-to-dest";

/**
 * 1) Bridge hub → destination via PIEUSD warp with `RECIPIENT` = RemoteAdapter (or other custodian).
 * 2) Print balances for visibility.
 *
 * Env:
 *   REMOTE_ADAPTER_ADDRESS — optional; when set, used as RECIPIENT for the warp if RECIPIENT is unset
 *   HYP_DEST, AMOUNT, INTERCHAIN_GAS_WEI — forwarded to hub transfer (see hyperlane scripts)
 */
async function main(): Promise<void> {
  const ra = process.env.REMOTE_ADAPTER_ADDRESS?.trim();
  if (!process.env.RECIPIENT?.trim() && ra) {
    process.env.RECIPIENT = ethers.getAddress(ra);
  }
  await runTransferHubToDest();
  await runPrintBalances();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
