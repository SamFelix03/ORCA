import "./load-env.js";
import { buildServer } from "./server.js";
import { config } from "./config.js";
import { startStreamIngestor } from "./workers/stream-ingestor.js";

async function main(): Promise<void> {
  if (config.strictMode) {
    if (!config.databaseUrl) throw new Error("DATABASE_URL is required in strict mode.");
    if (!config.redisUrl) throw new Error("REDIS_URL is required in strict mode.");
    if (!config.jwtSecret) throw new Error("JWT_SECRET is required in strict mode.");
    if (!config.webhookSecret) throw new Error("WEBHOOK_SECRET is required in strict mode.");
  }
  const app = await buildServer();
  const stopIngestor = await startStreamIngestor(app, config.redisUrl);
  app.addHook("onClose", async () => {
    await stopIngestor();
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
