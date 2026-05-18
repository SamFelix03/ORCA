export const DEFAULT_ORCA_API_BASE_URL = process.env.NEXT_PUBLIC_ORCA_API_BASE_URL ?? "http://localhost:4000";

const BACKEND_URL_STORAGE_KEY = "orca_backend_url";

type OrcaHealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

function isLocalHttpUrl(url: URL) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

export function normalizeOrcaBackendUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "https:" && !isLocalHttpUrl(parsed)) {
    throw new Error("Use an https:// backend URL.");
  }

  return parsed.origin;
}

export function getStoredOrcaBackendUrl(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  if (!stored) return null;
  try {
    return normalizeOrcaBackendUrl(stored);
  } catch {
    localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    return null;
  }
}

export function setStoredOrcaBackendUrl(value: string): string {
  const normalized = normalizeOrcaBackendUrl(value);
  localStorage.setItem(BACKEND_URL_STORAGE_KEY, normalized);
  return normalized;
}

export function getOrcaApiBaseUrl(): string {
  return getStoredOrcaBackendUrl() ?? normalizeOrcaBackendUrl(DEFAULT_ORCA_API_BASE_URL);
}

export function getOrcaWsUrl(): string {
  const apiUrl = new URL(getOrcaApiBaseUrl());
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = "/ws";
  apiUrl.search = "";
  apiUrl.hash = "";
  return apiUrl.toString();
}

export async function validateOrcaBackendUrl(value: string): Promise<string> {
  const normalized = normalizeOrcaBackendUrl(value);
  const response = await fetch(`${normalized}/health`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Backend health check failed.");
  }

  const health = (await response.json()) as Partial<OrcaHealthResponse>;
  if (health.status !== "ok" || health.service !== "orca-api") {
    throw new Error("This URL does not look like an ORCA API backend.");
  }

  return normalized;
}
