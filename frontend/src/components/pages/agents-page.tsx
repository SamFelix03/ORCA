"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function AgentsPage() {
  const { data, loading, error } = useOrcaResource(() => orcaApi.agents(), []);

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
                <span className="text-[#5c564c]">Spending</span>
                <span>{agent.spendingUsedUsdc} / {agent.spendingCapUsdc} USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#5c564c]">PoAI</span>
                <span>{agent.poaiScore.toFixed(0)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
