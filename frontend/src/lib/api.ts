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
  ScoutPurchaseBindingRequest,
  ScoutPurchaseConfirmResponse,
  ScoutPurchaseQuoteResponse,
  ScoutRegistrationAttestRequest,
  ScoutRegistrationChallengeResponse,
  ScoutRegistrationConfirmResponse,
  ScoutRegistrationTxDataResponse,
  ScoutsResponse,
  SignalResponse,
  SignalWorkflowResponse,
  SignalsResponse,
  TreasuryResponse,
  TokenBalancesResponse,
  VaultHoldingsResponse,
} from "@orca/shared";
import { ORCA_API_BASE_URL } from "./config";

const JWT_STORAGE_KEY = "orca_jwt";

type AuthMode = "none" | "optional" | "required";

function readStoredJwt(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function authHeaders(mode: AuthMode): HeadersInit {
  const token = readStoredJwt();
  if (!token || mode === "none") {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      throw new Error(text || "Unauthorized. Sign in with your wallet to continue.");
    }
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

async function apiGet<T>(path: string, mode: AuthMode = "none"): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: authHeaders(mode),
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

async function apiPost<T>(path: string, body: unknown, mode: AuthMode = "none"): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(mode),
    },
    body: JSON.stringify(body),
  });

  return parseJson<T>(response);
}

async function apiPut<T>(path: string, body: unknown, mode: AuthMode = "none"): Promise<T> {
  const response = await fetch(`${ORCA_API_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(mode),
    },
    body: JSON.stringify(body),
  });

  return parseJson<T>(response);
}

export const orcaApi = {
  health: () => apiGet<{ status: string; service: string; timestamp: string }>("/health"),
  chainStatus: () => apiGet<{ network: { chainId: number; latestBlock: number; rpcUrl: string }; registryEpoch: number | null; spendingWindow: { spentInWindow: string; windowStart: number; pausedUntil: number } | null }>("/chain/status"),
  positions: () => apiGet<PositionsResponse>("/positions"),
  vaultHoldings: () => apiGet<VaultHoldingsResponse>("/vault-holdings"),
  agents: () => apiGet<AgentsResponse>("/agents"),
  signals: () => apiGet<SignalsResponse>("/signals"),
  signalById: (id: string) => apiGet<SignalResponse>(`/signals/${encodeURIComponent(id)}`),
  signalWorkflow: (id: string) => apiGet<SignalWorkflowResponse>(`/signals/${encodeURIComponent(id)}/workflow`),
  executions: () => apiGet<ExecutionsResponse>("/executions"),
  treasury: () => apiGet<TreasuryResponse>("/treasury/balance"),
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
  scoutPurchaseQuote: (marketplaceId: string) =>
    apiGet<ScoutPurchaseQuoteResponse>(`/scouts/${encodeURIComponent(marketplaceId)}/purchase-quote`),
  scoutPurchaseConfirm: (marketplaceId: string, body: { buyerWallet: string; txHash: string }) =>
    apiPost<ScoutPurchaseConfirmResponse>(`/scouts/${encodeURIComponent(marketplaceId)}/purchase/confirm`, body),
  scoutPurchaseBinding: (purchaseId: string, body: ScoutPurchaseBindingRequest) =>
    apiPut<{ ok: boolean }>(`/scouts/purchases/${encodeURIComponent(purchaseId)}/binding`, body),
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
  myVaultHoldings: (token: string | null, wallet?: string) => {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    if (token) {
      return apiGetAuth<VaultHoldingsResponse>(`/me/vault-holdings${q}`, token);
    }
    if (!wallet) {
      throw new Error("Provide wallet for unauthenticated /me/vault-holdings");
    }
    return apiGet<VaultHoldingsResponse>(`/me/vault-holdings${q}`);
  },
  myTokenBalances: (token: string | null, wallet?: string) => {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    if (token) {
      return apiGetAuth<TokenBalancesResponse>(`/me/token-balances${q}`, token);
    }
    if (!wallet) {
      throw new Error("Provide wallet for unauthenticated /me/token-balances");
    }
    return apiGet<TokenBalancesResponse>(`/me/token-balances${q}`);
  },
  refreshVaultHoldings: (token: string | null, wallet?: string) => {
    const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    if (token) {
      return apiPost<VaultHoldingsResponse>(`/me/vault-holdings/refresh${q}`, {}, "optional");
    }
    if (!wallet) {
      throw new Error("Provide wallet for unauthenticated /me/vault-holdings/refresh");
    }
    return apiPost<VaultHoldingsResponse>(`/me/vault-holdings/refresh${q}`, {});
  },
};
