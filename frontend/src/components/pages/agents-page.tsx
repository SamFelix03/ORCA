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
        <h2 className="text-2xl font-semibold">Agents</h2>
        <p className="text-sm text-[rgb(var(--primary-11))]">Identity and vault metadata from ORCA registry-compatible data surfaces.</p>
      </header>

      {loading ? <p className="text-sm text-[rgb(var(--primary-11))]">Loading agents...</p> : null}
      {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {(data?.agents ?? []).map((agent) => (
          <Card key={agent.did}>
            <CardHeader>
              <CardTitle>{agent.type.toUpperCase()} Agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Status</span>
                <StatusPill tone={agent.online ? "healthy" : "muted"}>{agent.online ? "online" : "offline"}</StatusPill>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[rgb(var(--primary-11))]">DID</span>
                <span className="font-mono text-xs">{agent.did}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[rgb(var(--primary-11))]">Vault</span>
                <span className="font-mono text-xs">{agent.vaultAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Spending</span>
                <span>{agent.spendingUsedUsdc} / {agent.spendingCapUsdc} USDC</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
