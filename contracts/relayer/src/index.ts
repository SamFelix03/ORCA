import "../../scripts/lib/load-contracts-env.js";
import { loadRelayerConfig } from "./config.js";
import { processPendingDispatches } from "./watch.js";

async function main(): Promise<void> {
  const cfg = loadRelayerConfig();
  console.log(
    JSON.stringify({
      origin: cfg.origin.name,
      destinations: [...cfg.destinations.values()].map((d) => d.name),
      allowlistSize: cfg.allowlistedRecipients.size,
      pollMs: cfg.pollMs,
    }),
  );

  const loop = async (): Promise<void> => {
    try {
      await processPendingDispatches(cfg);
    } catch (e) {
      console.error("[relayer-error]", e instanceof Error ? e.message : e);
    }
    setTimeout(loop, cfg.pollMs);
  };

  await loop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
