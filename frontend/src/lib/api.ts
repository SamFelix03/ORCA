import type {
  AgentsResponse,
  AlertsResponse,
  AuthNonceResponse,
  AuthVerifyResponse,
  DepositsResponse,
  ExecutionsResponse,
  PoAIAgentHistoryResponse,
  PoAIEpochRewardsResponse,
  PositionsResponse,
  ScoutMarketplaceRecord,
  ScoutPayoutsResponse,
  ScoutRegistrationAttestRequest,
  ScoutRegistrationChallengeResponse,
  ScoutRegistrationConfirmResponse,
  ScoutRegistrationTxDataResponse,
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

async function apiGetAuth<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
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
  scoutRegisterChallenge: (did: string) =>
    apiGet<ScoutRegistrationChallengeResponse>(`/scouts/register/challenge?did=${encodeURIComponent(did)}`),
  scoutRegisterAttest: (body: ScoutRegistrationAttestRequest) =>
    apiPost<{ scout: ScoutMarketplaceRecord }>("/scouts/register", body),
  scoutRegisterTxData: (marketplaceId: string) =>
    apiGet<ScoutRegistrationTxDataResponse>(`/scouts/register/tx/${encodeURIComponent(marketplaceId)}`),
  scoutRegisterConfirm: (body: { marketplaceId: string; txHash: string }) =>
    apiPost<ScoutRegistrationConfirmResponse>("/scouts/register/confirm", body),
  scoutPayouts: (did?: string) =>
    apiGet<ScoutPayoutsResponse>(did ? `/scouts/payouts?did=${encodeURIComponent(did)}` : "/scouts/payouts"),
  authNonce: (address: string) => apiPost<AuthNonceResponse>("/auth/nonce", { address }),
  authVerify: (body: { address: string; signature: string; nonce: string }) =>
    apiPost<AuthVerifyResponse>("/auth/verify", body),
  myPositions: (token: string | null, wallet?: string) => {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    if (token) {
      return apiGetAuth<PositionsResponse>(`/me/positions${q}`, token);
    }
    if (!wallet) {
      throw new Error("Provide wallet for unauthenticated /me/positions");
    }
    return apiGet<PositionsResponse>(`/me/positions${q}`);
  },
  myDeposits: (token: string | null, wallet?: string) => {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    if (token) {
      return apiGetAuth<DepositsResponse>(`/me/deposits${q}`, token);
    }
    if (!wallet) {
      throw new Error("Provide wallet for unauthenticated /me/deposits");
    }
    return apiGet<DepositsResponse>(`/me/deposits${q}`);
  },
};
