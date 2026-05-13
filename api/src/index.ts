import { buildServer } from "./server.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const app = await buildServer();

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
