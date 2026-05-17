import type { AgentType } from "@prisma/client";
import { prisma } from "./prisma.js";

const PLACEHOLDER_VAULT =
  process.env.AGENT_PLACEHOLDER_VAULT_ADDRESS?.trim() ||
  "0x0000000000000000000000000000000000000001";

const ENV_AGENT_DIDS: Array<{ env: string; type: AgentType }> = [
  { env: "SCOUT_DID", type: "scout" },
  { env: "SCOUT_AGENT_DID", type: "scout" },
  { env: "RISK_AGENT_DID", type: "risk" },
  { env: "EXECUTOR_AGENT_DID", type: "executor" },
  { env: "AUDIT_AGENT_DID", type: "audit" },
];

export function inferAgentTypeFromDid(did: string): AgentType {
  const lower = did.toLowerCase();
  for (const type of ["scout", "risk", "executor", "audit"] as const) {
    if (lower.includes(type)) return type;
  }
  return "scout";
}

export async function ensureAgentForDid(
  did: string,
  preferredType?: AgentType,
): Promise<void> {
  const trimmed = did.trim();
  if (!trimmed) return;
  const type = preferredType ?? inferAgentTypeFromDid(trimmed);
  await prisma.agent.upsert({
    where: { did: trimmed },
    update: { online: true, lastActionAt: new Date() },
    create: {
      did: trimmed,
      type,
      vaultAddress: PLACEHOLDER_VAULT,
      online: true,
    },
  });
}

export async function bootstrapAgentsFromEnv(): Promise<number> {
  const seen = new Set<string>();
  let count = 0;
  for (const { env, type } of ENV_AGENT_DIDS) {
    const did = process.env[env]?.trim();
    if (!did || seen.has(did)) continue;
    seen.add(did);
    await ensureAgentForDid(did, type);
    count += 1;
  }
  return count;
}

/** True when a workflow event may reference signalId (FK to Signal). */
export function shouldLinkWorkflowEvent(
  signalId: string | null | undefined,
  signal: { id: string } | null,
): boolean {
  if (!signalId?.trim()) return false;
  return signal !== null;
}
