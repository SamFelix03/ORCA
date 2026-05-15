import type { WsEnvelope } from "@orca/shared";
import { ORCA_WS_URL } from "./config";

export function connectOrcaEvents(onEvent: (event: WsEnvelope) => void): WebSocket {
  const ws = new WebSocket(ORCA_WS_URL);

  ws.onmessage = (message) => {
    const parsed = JSON.parse(message.data as string) as WsEnvelope;
    onEvent(parsed);
  };

  return ws;
}
