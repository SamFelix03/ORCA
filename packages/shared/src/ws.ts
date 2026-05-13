import type { AlertRecord, SessionRecord, SignalRecord } from "./domain.js";

export type WsEventType =
  | "signal.created"
  | "signal.updated"
  | "execution.settled"
  | "alert.created"
  | "session.requested"
  | "session.updated";

export interface WsEventMap {
  "signal.created": { signal: SignalRecord };
  "signal.updated": { signal: SignalRecord };
  "execution.settled": { signalId: string; txHash: string; status: "success" | "failed" };
  "alert.created": { alert: AlertRecord };
  "session.requested": { session: SessionRecord };
  "session.updated": { session: SessionRecord };
}

export interface WsEnvelope<T extends WsEventType = WsEventType> {
  type: T;
  at: string;
  payload: WsEventMap[T];
}
