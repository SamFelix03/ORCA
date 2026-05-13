import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { registerWsGateway } from "./ws/gateway.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerPositionRoutes } from "./routes/positions.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerSignalRoutes } from "./routes/signals.js";
import { registerTreasuryRoutes } from "./routes/treasury.js";
import { registerPoAIRoutes } from "./routes/poai.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerChainRoutes } from "./routes/chain.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: config.corsOrigin,
  });

  await app.register(websocket);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerSessionRoutes(app);
  await registerPositionRoutes(app);
  await registerAgentRoutes(app);
  await registerSignalRoutes(app);
  await registerTreasuryRoutes(app);
  await registerPoAIRoutes(app);
  await registerAlertRoutes(app);
  await registerChainRoutes(app);

  registerWsGateway(app);

  return app;
}
