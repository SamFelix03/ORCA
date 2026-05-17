/** @deprecated Use test-warp-kite-to-stub.ts with HYP_DEST=basesepolia */
import path from "node:path";
import dotenv from "dotenv";
import { runWarpKiteToStubTest } from "./test-warp-kite-to-stub";

dotenv.config({ path: path.join(path.resolve(__dirname, ".."), ".env") });

async function main(): Promise<void> {
  const ok = await runWarpKiteToStubTest("basesepolia");
  process.exitCode = ok ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
