import type { AlertRecord, SignalRecord } from "./domain.js";

export type WsEventType =
  | "signal.created"
  | "signal.updated"
  | "execution.settled"
  | "execution.created"
  | "workflow.updated"
  | "alert.created";

export interface WsEventMap {
  "signal.created": { signal: SignalRecord };
  "signal.updated": { signal: SignalRecord };
  "execution.settled": { signalId: string; txHash: string; status: "success" | "failed" };
  "execution.created": { executionId: string; signalId: string; status: string };
  "workflow.updated": { signalId: string; eventType: string };
  "alert.created": { alert: AlertRecord };
}

export interface WsEnvelope<T extends WsEventType = WsEventType> {
  type: T;
  at: string;
  payload: WsEventMap[T];
}
