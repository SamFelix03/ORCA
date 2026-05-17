import assert from "node:assert/strict";
import test from "node:test";
import { inferAgentTypeFromDid, shouldLinkWorkflowEvent } from "./ensure-agent.js";

test("inferAgentTypeFromDid maps known agent names", () => {
  assert.equal(inferAgentTypeFromDid("did:kite:orca/scout-1"), "scout");
  assert.equal(inferAgentTypeFromDid("did:kite:orca/risk-1"), "risk");
  assert.equal(inferAgentTypeFromDid("did:kite:orca/executor-1"), "executor");
  assert.equal(inferAgentTypeFromDid("did:kite:orca/audit-1"), "audit");
});

test("inferAgentTypeFromDid defaults to scout for unknown DIDs", () => {
  assert.equal(inferAgentTypeFromDid("did:kite:orca/custom-agent"), "scout");
});

test("shouldLinkWorkflowEvent requires signal row when signalId is set", () => {
  assert.equal(shouldLinkWorkflowEvent("sig-1", { id: "sig-1" }), true);
  assert.equal(shouldLinkWorkflowEvent("sig-1", null), false);
  assert.equal(shouldLinkWorkflowEvent(null, { id: "sig-1" }), false);
  assert.equal(shouldLinkWorkflowEvent("", { id: "sig-1" }), false);
});
