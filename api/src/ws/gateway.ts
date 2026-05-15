import type { FastifyInstance } from "fastify";
import type { WsEnvelope } from "@orca/shared";

type WsClient = {
  readyState: number;
  OPEN: number;
  send: (payload: string) => void;
};

const clients = new Set<WsClient>();

export function registerWsGateway(app: FastifyInstance): void {
  app.get("/ws", { websocket: true }, (socket) => {
    const client = socket as unknown as WsClient & {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    clients.add(client);

    const hello: WsEnvelope<"session.updated"> = {
      type: "session.updated",
      at: new Date().toISOString(),
      payload: {
        session: {
          id: "ws.connected",
          agentDid: "system",
          maxAmountPerTxUsdc: 0,
          maxTotalAmountUsdc: 0,
          usedAmountUsdc: 0,
          ttlSeconds: 0,
          status: "active",
          createdAt: new Date().toISOString(),
        },
      },
    };

    client.send(JSON.stringify(hello));

    client.on("close", () => {
      clients.delete(client);
    });

    client.on("error", () => {
      clients.delete(client);
    });

    client.on("message", (_raw: unknown) => {
      // Reserved for future client subscriptions and auth handshake.
    });
  });
}

export function broadcast(message: WsEnvelope): void {
  const payload = JSON.stringify(message);

  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}
