import type {
  AgentsResponse,
  AlertsResponse,
  ExecutionsResponse,
  PoAIAgentHistoryResponse,
  PoAIEpochRewardsResponse,
  PositionsResponse,
  ScoutPayoutsResponse,
  ScoutsResponse,
  SessionsResponse,
  SignalResponse,
  SignalsResponse,
  TreasuryPendingResponse,
  TreasuryResponse,
} from "@orca/shared";
import { ORCA_API_BASE_URL } from "./config";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  return parseJson<T>(response);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseJson<T>(response);
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    method: "DELETE",
  });

  return parseJson<T>(response);
}

export const orcaApi = {
  health: () => apiGet<{ status: string; service: string; timestamp: string }>("/health"),
  chainStatus: () => apiGet<{ network: { chainId: number; latestBlock: number; rpcUrl: string }; registryEpoch: number | null; spendingWindow: { spentInWindow: string; windowStart: number; pausedUntil: number } | null }>("/chain/status"),
  positions: () => apiGet<PositionsResponse>("/positions"),
  agents: () => apiGet<AgentsResponse>("/agents"),
  signals: () => apiGet<SignalsResponse>("/signals"),
  signalById: (id: string) => apiGet<SignalResponse>(`/signals/${encodeURIComponent(id)}`),
  executions: () => apiGet<ExecutionsResponse>("/executions"),
  sessions: () => apiGet<SessionsResponse>("/sessions"),
  approveSession: (sessionId: string) => apiPost<{ ok: boolean; error?: string }>("/sessions/approve", { sessionId }),
  expireSession: (sessionId: string) => apiDelete<{ ok: boolean; error?: string }>(`/sessions/${encodeURIComponent(sessionId)}`),
  treasury: () => apiGet<TreasuryResponse>("/treasury/balance"),
  pendingMultisig: () => apiGet<TreasuryPendingResponse>("/treasury/multisig/pending"),
  poaiEpoch: (id: number) => apiGet<PoAIEpochRewardsResponse>(`/poai/epoch/${id}/rewards`),
  poaiAgent: (did: string) => apiGet<PoAIAgentHistoryResponse>(`/poai/agents/${encodeURIComponent(did)}/history`),
  alerts: () => apiGet<AlertsResponse>("/alerts"),
  scouts: () => apiGet<ScoutsResponse>("/scouts"),
  registerScout: (payload: { did: string; ownerAddress: string; stakeUsdc: number }) =>
    apiPost<{ scout: { id: string; did: string; ownerAddress: string; status: string; stakeUsdc: number; reputationScore: number; createdAt: string } }>("/scouts/register", payload),
  scoutPayouts: (did?: string) => apiGet<ScoutPayoutsResponse>(`/scouts/payouts/${did ? encodeURIComponent(did) : ""}`),
};
