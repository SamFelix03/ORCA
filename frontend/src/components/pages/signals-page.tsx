"use client";

import type { SignalRecord, SignalWorkflowResponse, WorkflowEventRecord } from "@orca/shared";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { TxLink } from "@/components/ui/tx-link";
import { orcaApi } from "@/lib/api";
import { formatPieUsdPaymentAmountRaw, shortTxHash } from "@/lib/format-chain";
import { connectOrcaEvents } from "@/lib/ws";
import { useOrcaResource } from "./use-orca-resource";

function statusTone(status: SignalRecord["status"]) {
  if (status === "failed" || status === "rejected") return "critical";
  if (status === "pending" || status === "executing") return "warning";
  return "healthy";
}

function stepActor(event: WorkflowEventRecord) {
  return event.agentType ?? event.agentDid ?? "system";
}

type SignalTransaction = {
  key: string;
  label: string;
  actor: string;
  txHash: string;
  chainId?: number | null;
  note?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function chainIdFromNetwork(network: string | null | undefined): number | null {
  const normalized = (network ?? "").toLowerCase();
  if (normalized.includes("kite")) return 2368;
  if (normalized.includes("base")) return 84532;
  if (normalized.includes("arbitrum") || normalized.includes("arb")) return 421614;
  if (normalized.includes("optimism") || normalized.includes("op-sepolia")) return 11155420;
  if (normalized.includes("sepolia")) return 11155111;
  return null;
}

function eventTransactionLabel(event: WorkflowEventRecord, txKind: "tx" | "payment") {
  if (txKind === "payment") return `${stepActor(event)} x402 payment`;
  const eventType = event.eventType.toLowerCase();
  if (eventType.includes("poai")) return `${stepActor(event)} PoAI attribution`;
  if (eventType.includes("vault")) return "Executor vault transaction";
  if (eventType.includes("deposit")) return "Executor destination deposit";
  if (eventType.includes("approval")) return "Executor token approval";
  if (eventType.includes("relayer")) return "Relayer transaction";
  if (event.agentType === "executor") return "Executor transaction";
  return event.title;
}

function collectWorkflowTransactions(workflow: SignalWorkflowResponse): SignalTransaction[] {
  const items: SignalTransaction[] = [];
  const seen = new Set<string>();
  const add = (item: Omit<SignalTransaction, "key">) => {
    if (!item.txHash || item.txHash === "0x0000000000000000000000000000000000000000000000000000000000000000") return;
    const key = `${item.label}:${item.chainId ?? "unknown"}:${item.txHash.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, key });
  };

  if (workflow.riskInstruction?.paymentTxHash) {
    add({
      label: "Risk x402 payment",
      actor: workflow.riskInstruction.riskDid,
      txHash: workflow.riskInstruction.paymentTxHash,
      chainId: 2368,
      note: "Risk paid Executor after verdict creation.",
    });
  }

  if (workflow.execution?.txHash) {
    add({
      label: "Executor settlement",
      actor: workflow.execution.executorDid,
      txHash: workflow.execution.txHash,
      chainId: 2368,
      note: workflow.execution.status,
    });
  }

  for (const event of workflow.events) {
    if (event.txHash) {
      add({
        label: eventTransactionLabel(event, "tx"),
        actor: stepActor(event),
        txHash: event.txHash,
        chainId: event.chainId,
        note: event.summary,
      });
    }
    if (event.paymentTxHash) {
      add({
        label: eventTransactionLabel(event, "payment"),
        actor: stepActor(event),
        txHash: event.paymentTxHash,
        chainId: 2368,
        note: "Agent micropayment.",
      });
    }
    const payload = isRecord(event.payload) ? event.payload : null;
    const relatedTxs = Array.isArray(payload?.relatedTxs) ? payload.relatedTxs : [];
    for (const related of relatedTxs) {
      if (!isRecord(related)) continue;
      add({
        label: asString(related.label) || asString(related.kind) || "Related transaction",
        actor: stepActor(event),
        txHash: asString(related.txHash),
        chainId: asNumber(related.chainId) ?? event.chainId,
        note: event.summary,
      });
    }
    for (const key of ["poaiTxHash", "vaultTxHash", "dispatchTxHash", "deliveryTxHash"]) {
      const txHash = payload ? asString(payload[key]) : "";
      if (!txHash) continue;
      add({
        label: key === "poaiTxHash" ? `${stepActor(event)} PoAI attribution` : `${stepActor(event)} ${key}`,
        actor: stepActor(event),
        txHash,
        chainId: asNumber(payload?.[key === "poaiTxHash" ? "poaiChainId" : "chainId"]) ?? event.chainId,
        note: event.summary,
      });
    }
  }

  for (const payment of workflow.payments) {
    add({
      label: "x402 micropayment",
      actor: `${payment.fromDid ?? "agent"} -> ${payment.toDid}`,
      txHash: payment.txHash,
      chainId: chainIdFromNetwork(payment.network) ?? 2368,
      note: `${formatPieUsdPaymentAmountRaw(payment.amountWei)} PIEUSD`,
    });
  }

  for (const message of workflow.relayerMessages) {
    if (message.dispatchTxHash) {
      add({
        label: "Relayer dispatch",
        actor: `${message.originDomain} -> ${message.destinationDomain}`,
        txHash: message.dispatchTxHash,
        chainId: message.originDomain,
        note: message.status,
      });
    }
    if (message.deliveryTxHash) {
      add({
        label: "Relayer delivery",
        actor: `${message.originDomain} -> ${message.destinationDomain}`,
        txHash: message.deliveryTxHash,
        chainId: message.destinationDomain,
        note: message.status,
      });
    }
  }

  return items;
}

export function SignalsPage() {
  const { data, loading, error, reload } = useOrcaResource(() => orcaApi.signals(), []);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<SignalWorkflowResponse | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  useEffect(() => {
    const ws = connectOrcaEvents((event) => {
      if (
        event.type === "signal.created" ||
        event.type === "signal.updated" ||
        event.type === "execution.settled" ||
        event.type === "workflow.updated"
      ) {
        void reload();
        if ("signalId" in event.payload && event.payload.signalId === selectedSignalId) {
          void loadWorkflow(event.payload.signalId);
        }
      }
    });

    return () => ws.close();
  }, [reload, selectedSignalId]);

  async function loadWorkflow(signalId: string) {
    setSelectedSignalId(signalId);
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const next = await orcaApi.signalWorkflow(signalId);
      setWorkflow(next);
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setWorkflowLoading(false);
    }
  }

  function closeWorkflow() {
    setSelectedSignalId(null);
    setWorkflow(null);
    setWorkflowError(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Signals</CardTitle>
          <p className="text-sm text-[#5c564c]">Scout opportunities, Risk verdicts, payments, and execution traces.</p>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-[#5c564c]">Loading signals...</p> : null}
          {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

          {!loading && !error ? (
            <DataTable>
              <DataThead>
                <tr>
                  <DataTh>Route</DataTh>
                  <DataTh>Net APY</DataTh>
                  <DataTh>Payment Value</DataTh>
                  <DataTh>Status</DataTh>
                  <DataTh>Verdict</DataTh>
                  <DataTh>Trace</DataTh>
                </tr>
              </DataThead>
              <tbody>
                {(data?.signals ?? []).map((signal) => (
                  <tr key={signal.id} className="cursor-pointer hover:bg-black/[0.03]" onClick={() => void loadWorkflow(signal.id)}>
                    <DataTd>{`${signal.srcProtocol} -> ${signal.dstProtocol}`}</DataTd>
                    <DataTd>{signal.netDeltaApy.toFixed(2)}%</DataTd>
                    <DataTd>{signal.paymentAmountWei ? `${formatPieUsdPaymentAmountRaw(signal.paymentAmountWei)} pieUSD` : "-"}</DataTd>
                    <DataTd>
                      <StatusPill tone={statusTone(signal.status)}>{signal.status}</StatusPill>
                    </DataTd>
                    <DataTd>{signal.riskDecisionReason ?? "-"}</DataTd>
                    <DataTd>
                      <Button type="button" size="sm" variant="secondary" onClick={(event) => {
                        event.stopPropagation();
                        void loadWorkflow(signal.id);
                      }}>
                        View
                      </Button>
                    </DataTd>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </CardContent>
      </Card>

      <SignalWorkflowModal
        selectedSignalId={selectedSignalId}
        workflow={workflow}
        workflowLoading={workflowLoading}
        workflowError={workflowError}
        onClose={closeWorkflow}
      />
    </>
  );
}

function SignalWorkflowModal({
  selectedSignalId,
  workflow,
  workflowLoading,
  workflowError,
  onClose,
}: {
  selectedSignalId: string | null;
  workflow: SignalWorkflowResponse | null;
  workflowLoading: boolean;
  workflowError: string | null;
  onClose: () => void;
}) {
  if (typeof document === "undefined" || !selectedSignalId) return null;
  const transactions = workflow ? collectWorkflowTransactions(workflow) : [];

  return createPortal(
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close signal workflow" onClick={onClose} />
      <section className="relative z-10 max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded border border-black/15 bg-[#fffaf0] text-black shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/10 bg-[#fffaf0] p-4">
          <div>
            <h3 className="text-xl font-semibold">Signal Workflow</h3>
            <p className="mt-1 font-mono text-xs text-[#5c564c]">{selectedSignalId}</p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="space-y-4 p-4">
          {workflowLoading ? <p className="text-sm text-[#5c564c]">Loading workflow...</p> : null}
          {workflowError ? <p className="text-sm text-[rgb(var(--danger-11))]">{workflowError}</p> : null}

          {workflow ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <TraceMetric label="Route" value={`${workflow.signal.srcProtocol} -> ${workflow.signal.dstProtocol}`} />
                <TraceMetric label="Signal" value={workflow.signal.status} />
                <TraceMetric label="Risk" value={workflow.riskInstruction?.approved ? "approved" : workflow.riskInstruction ? "rejected" : "pending"} />
                <TraceMetric label="Payments" value={String(workflow.payments.length)} />
              </div>

              <section className="rounded border border-black/10 bg-[#fffdf8]">
                <div className="border-b border-black/10 px-4 py-3">
                  <h4 className="text-sm font-semibold">Transactions</h4>
                </div>
                <div className="grid gap-2 p-4 md:grid-cols-2">
                  {transactions.map((tx) => (
                    <div key={tx.key} className="rounded border border-black/10 bg-[#fffaf0] p-3 text-sm">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-semibold text-black">{tx.label}</p>
                          <p className="mt-1 text-xs text-[#5c564c]">{tx.actor}</p>
                        </div>
                        <TxLink txHash={tx.txHash} chainId={tx.chainId} className="text-xs" />
                      </div>
                      {tx.note ? <p className="mt-2 line-clamp-2 text-xs text-[#5c564c]">{tx.note}</p> : null}
                    </div>
                  ))}
                  {transactions.length === 0 ? <p className="text-sm text-[#5c564c]">No transactions recorded for this signal yet.</p> : null}
                </div>
              </section>

              <section className="rounded border border-black/10 bg-[#fffdf8]">
                <div className="border-b border-black/10 px-4 py-3">
                  <h4 className="text-sm font-semibold">Agent Interaction Timeline</h4>
                </div>
                <div className="divide-y divide-black/10">
                  {workflow.events.map((event, index) => (
                    <WorkflowStep key={event.id} event={event} index={index} />
                  ))}
                  {workflow.events.length === 0 ? <p className="p-4 text-sm text-[#5c564c]">No workflow events have been ingested for this signal yet.</p> : null}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Micropayments</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {workflow.payments.map((payment) => (
                      <div key={payment.id} className="rounded border border-black/10 bg-[#fffaf0] p-3 text-sm">
                        <p className="font-semibold">{`${payment.fromDid ?? "agent"} -> ${payment.toDid}`}</p>
                        <p className="mt-1 text-[#5c564c]">{formatPieUsdPaymentAmountRaw(payment.amountWei)} PIEUSD on {payment.network}</p>
                        <TxLink txHash={payment.txHash} chainId={2368} className="mt-2 text-xs" />
                      </div>
                    ))}
                    {workflow.payments.length === 0 ? <p className="text-sm text-[#5c564c]">No x402 payments recorded yet.</p> : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Relayer Messages</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {workflow.relayerMessages.map((message) => (
                      <div key={message.id} className="rounded border border-black/10 bg-[#fffaf0] p-3 text-sm">
                        <p className="font-semibold">{`${message.originDomain} -> ${message.destinationDomain}`}</p>
                        <p className="mt-1 text-[#5c564c]">{message.status}</p>
                        {message.dispatchTxHash ? (
                          <TxLink txHash={message.dispatchTxHash} chainId={message.originDomain} label={`dispatch ${shortTxHash(message.dispatchTxHash)}`} className="mt-2 text-xs" />
                        ) : null}
                        {message.deliveryTxHash ? (
                          <TxLink txHash={message.deliveryTxHash} chainId={message.destinationDomain} label={`delivery ${shortTxHash(message.deliveryTxHash)}`} className="mt-2 text-xs" />
                        ) : null}
                      </div>
                    ))}
                    {workflow.relayerMessages.length === 0 ? <p className="text-sm text-[#5c564c]">No relayer messages recorded yet.</p> : null}
                  </CardContent>
                </Card>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function TraceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-black/10 bg-[#fffdf8] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function evidenceFromVerdict(verdict: unknown): Record<string, unknown> | null {
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) return null;
  const nested = (verdict as { evidence?: unknown }).evidence;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
  return nested as Record<string, unknown>;
}

function WorkflowStep({ event, index }: { event: WorkflowEventRecord; index: number }) {
  const evidence = evidenceFromVerdict(event.verdict);
  return (
    <article className="p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">
            Step {index + 1} / {stepActor(event)}
          </p>
          <h5 className="mt-1 text-base font-semibold">{event.title}</h5>
          <p className="mt-1 text-sm text-[#5c564c]">{event.verdictSummary ?? event.summary}</p>
        </div>
        <div className="space-y-1 text-right font-mono text-xs">
          {event.txHash ? (
            <TxLink txHash={event.txHash} chainId={event.chainId} label={`tx ${shortTxHash(event.txHash)}`} className="block" />
          ) : null}
          {event.paymentTxHash ? (
            <TxLink txHash={event.paymentTxHash} chainId={2368} label={`x402 ${shortTxHash(event.paymentTxHash)}`} className="block" />
          ) : null}
        </div>
      </div>
      {evidence ? (
        <details className="mt-3 rounded border border-black/10 bg-[#fffdf8] p-3" open>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">
            Evidence
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </details>
      ) : null}
      {event.chainOfThought && event.chainOfThought.length > 0 ? (
        <div className="mt-3 rounded border border-black/10 bg-[#fffdf8] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Chain of Thought</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[#3d3830]">
            {event.chainOfThought.map((step, stepIndex) => (
              <li key={`${event.id}-cot-${stepIndex}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {event.verdict ? (
        <details className="mt-3 rounded border border-black/10 bg-[#fffaf0] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Verdict</summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(event.verdict, null, 2)}
          </pre>
        </details>
      ) : null}
      <details className="mt-3 rounded border border-black/10 bg-[#fffaf0] p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Details</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </article>
  );
}
