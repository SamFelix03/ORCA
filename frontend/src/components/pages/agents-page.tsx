"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { orcaApi } from "@/lib/api";
import { formatPieUsdPaymentAmountRaw } from "@/lib/format-chain";
import { connectOrcaEvents } from "@/lib/ws";
import { useOrcaResource } from "./use-orca-resource";

export function AgentsPage() {
  const { data, loading, error, reload } = useOrcaResource(() => orcaApi.agents(), []);

  useEffect(() => {
    const ws = connectOrcaEvents((event) => {
      if (event.type === "workflow.updated" || event.type === "signal.created" || event.type === "execution.settled") {
        void reload();
      }
    });

    return () => ws.close();
  }, [reload]);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-black">Agents</h2>
        <p className="mt-1 text-sm text-[#5c564c]">Scout, Risk, Executor, and Audit coordination.</p>
      </header>

      {loading ? <p className="text-sm text-[#5c564c]">Loading agents...</p> : null}
      {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {(data?.agents ?? []).map((agent) => (
          <Card key={agent.did}>
            <CardHeader>
              <CardTitle className="capitalize">{agent.type} Agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">Status</span>
                <StatusPill tone={agent.online ? "healthy" : "muted"}>{agent.online ? "online" : "offline"}</StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">x402 Payments</span>
                <span>{agent.x402PaymentCount ?? agent.spendingUsedUsdc}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#5c564c]">Payment value</span>
                <span className="text-right">{formatPieUsdPaymentAmountRaw(agent.x402PaymentAmountWei ?? "0")} pieUSD</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">Last action</span>
                <span>{agent.lastActionAt.startsWith("1970") ? "--" : new Date(agent.lastActionAt).toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
