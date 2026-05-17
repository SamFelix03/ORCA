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
