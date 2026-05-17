/**
 * Run warp→stub E2E on multiple spokes (requires relayer:start).
 *
 *   pnpm test:warp-kite-spokes
 *   TEST_SPOKES=sepolia,arbitrumsepolia pnpm test:warp-kite-spokes
 */
import path from "node:path";
import dotenv from "dotenv";
import { runWarpKiteToStubTest } from "./test-warp-kite-to-stub";

dotenv.config({ path: path.join(path.resolve(__dirname, ".."), ".env") });

const DEFAULT_SPOKES = ["sepolia", "arbitrumsepolia", "optimismsepolia"];

async function main(): Promise<void> {
  const list = (process.env.TEST_SPOKES ?? DEFAULT_SPOKES.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const results: Array<{ dest: string; ok: boolean; error?: string }> = [];

  for (const dest of list) {
    try {
      const ok = await runWarpKiteToStubTest(dest);
      results.push({ dest, ok });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ dest, ok: false, error: msg });
      // eslint-disable-next-line no-console -- CLI
      console.error(`[${dest}] FAILED:`, msg);
    }
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("\n=== SUMMARY ===\n", JSON.stringify(results, null, 2));
  process.exitCode = results.every((r) => r.ok) ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
