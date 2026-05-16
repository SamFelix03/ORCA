import { runPrintBalances } from "./print-balances";
import { runTransferHubToDest } from "./transfer-hub-to-dest";

/**
 * Run on hub network. Prints cross-chain balances; optionally sends hub→dest once.
 *
 * Env:
 *   HYP_DEST — basesepolia | arbitrumsepolia | optimismsepolia | sepolia (default basesepolia)
 *   RUN_TRANSFER=1 — after first snapshot, run transfer-hub-to-dest (needs AMOUNT)
 *   AMOUNT, RECIPIENT, INTERCHAIN_GAS_WEI — forwarded to transfer when RUN_TRANSFER=1
 */
async function main(): Promise<void> {
  // eslint-disable-next-line no-console -- CLI
  console.error("--- balances (before) ---");
  await runPrintBalances();

  if (process.env.RUN_TRANSFER === "1") {
    // eslint-disable-next-line no-console -- CLI
    console.error("--- transfer hub → dest ---");
    await runTransferHubToDest();
    // eslint-disable-next-line no-console -- CLI
    console.error("--- balances (after; relay may still be pending) ---");
    await runPrintBalances();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
