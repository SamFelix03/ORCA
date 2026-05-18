import type { WsEnvelope } from "@orca/shared";
import { getOrcaWsUrl } from "./config";

export function connectOrcaEvents(onEvent: (event: WsEnvelope) => void): WebSocket {
  const ws = new WebSocket(getOrcaWsUrl());

  ws.onmessage = (message) => {
    const parsed = JSON.parse(message.data as string) as WsEnvelope;
    onEvent(parsed);
  };

  return ws;
}
