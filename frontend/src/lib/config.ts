export const ORCA_API_BASE_URL = process.env.NEXT_PUBLIC_ORCA_API_BASE_URL ?? "http://localhost:4000";

export const ORCA_WS_URL =
  process.env.NEXT_PUBLIC_ORCA_WS_URL ?? ORCA_API_BASE_URL.replace(/^http/, "ws") + "/ws";
