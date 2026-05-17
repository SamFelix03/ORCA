import assert from "node:assert/strict";
import test from "node:test";
import { deliberationToWorkflowFields, parseLlmDeliberation } from "./llm-deliberation.js";

test("parseLlmDeliberation reads snake_case wire", () => {
  const parsed = parseLlmDeliberation({
    llm_deliberation: {
      agent_type: "risk",
      model: "llama-test",
      chain_of_thought: ["step 1"],
      verdict: { recommended_approved: true },
      verdict_summary: "Approve",
    },
  });
  assert.ok(parsed);
  const fields = deliberationToWorkflowFields(parsed!);
  assert.equal(fields.verdictSummary, "Approve");
  assert.deepEqual(fields.chainOfThought, ["step 1"]);
  assert.equal(fields.llmModel, "llama-test");
});
