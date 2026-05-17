import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type LlmDeliberationWire = {
  agent_type?: string;
  agentType?: string;
  model?: string;
  chain_of_thought?: string[];
  chainOfThought?: string[];
  verdict?: unknown;
  verdict_summary?: string;
  verdictSummary?: string;
  raw_content?: string | null;
  rawContent?: string | null;
};

export function parseLlmDeliberation(payload: Record<string, unknown>): LlmDeliberationWire | null {
  const raw = payload.llm_deliberation ?? payload.llmDeliberation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as LlmDeliberationWire;
}

export function deliberationToWorkflowFields(d: LlmDeliberationWire) {
  const chain = d.chain_of_thought ?? d.chainOfThought;
  const summary = d.verdict_summary ?? d.verdictSummary;
  return {
    chainOfThought: Array.isArray(chain) ? (chain as Prisma.InputJsonValue) : undefined,
    verdict: d.verdict !== undefined ? (JSON.parse(JSON.stringify(d.verdict)) as Prisma.InputJsonValue) : undefined,
    verdictSummary: typeof summary === "string" ? summary : undefined,
    llmModel: typeof d.model === "string" ? d.model : undefined,
  };
}

export async function persistAgentDeliberation(params: {
  signalId?: string | null;
  agentType: "scout" | "risk" | "executor" | "audit";
  agentDid?: string | null;
  step: string;
  deliberation: LlmDeliberationWire;
}) {
  const chain = params.deliberation.chain_of_thought ?? params.deliberation.chainOfThought ?? [];
  const summary = params.deliberation.verdict_summary ?? params.deliberation.verdictSummary ?? "";
  const model = params.deliberation.model ?? "unknown";
  await prisma.agentDeliberation.create({
    data: {
      signalId: params.signalId,
      agentType: params.agentType,
      agentDid: params.agentDid,
      step: params.step,
      llmModel: model,
      chainOfThought: chain as Prisma.InputJsonValue,
      verdict: JSON.parse(JSON.stringify(params.deliberation.verdict ?? {})) as Prisma.InputJsonValue,
      verdictSummary: summary,
      rawContent: params.deliberation.raw_content ?? params.deliberation.rawContent ?? null,
    },
  });
}
