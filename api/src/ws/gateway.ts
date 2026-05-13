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

    const hello: WsEnvelope<"signal.updated"> = {
      type: "signal.updated",
      at: new Date().toISOString(),
      payload: {
        signal: {
          id: "sig-live-hello",
          scoutDid: "did:kite:orca/scout-1",
          srcChain: 1,
          dstChain: 10,
          srcProtocol: "aave-v3",
          dstProtocol: "compound-v3",
          netDeltaApy: 0.7,
          suggestedAmountUsdc: 3000,
          status: "pending",
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
