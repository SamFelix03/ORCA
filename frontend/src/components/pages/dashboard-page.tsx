"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import { LiveEvents } from "@/components/live-events";

export function DashboardPage() {
  const { data, loading, error } = useOrcaResource(async () => {
    const [agents, positions, signals, sessions, treasury, alerts] = await Promise.all([
      orcaApi.agents(),
      orcaApi.positions(),
      orcaApi.signals(),
      orcaApi.sessions(),
      orcaApi.treasury(),
      orcaApi.alerts(),
    ]);

    return { agents, positions, signals, sessions, treasury, alerts };
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-[rgb(var(--primary-12))]">Operational Dashboard</h2>
        <p className="text-sm text-[rgb(var(--primary-11))]">Live overview of contract-integrated services and governance surfaces.</p>
      </header>

      {error ? <p className="rounded-xl border border-[rgb(var(--danger-6))] bg-[rgb(var(--danger-2))] px-4 py-3 text-sm text-[rgb(var(--danger-12))]">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Online Agents" value={loading || !data ? "--" : String(data.agents.agents.filter((item) => item.online).length)} />
        <MetricCard label="Open Positions" value={loading || !data ? "--" : String(data.positions.positions.length)} />
        <MetricCard label="Pending Signals" value={loading || !data ? "--" : String(data.signals.signals.filter((item) => item.status === "pending").length)} />
        <MetricCard label="Treasury USDC" value={loading || !data ? "--" : data.treasury.treasury.balanceUsdc.toLocaleString()} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Latest Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable>
              <DataThead>
                <tr>
                  <DataTh>Route</DataTh>
                  <DataTh>Delta APY</DataTh>
                  <DataTh>Status</DataTh>
                  <DataTh>Amount</DataTh>
                </tr>
              </DataThead>
              <tbody>
                {(data?.signals.signals ?? []).slice(0, 5).map((signal) => (
                  <tr key={signal.id}>
                    <DataTd>{signal.srcProtocol} → {signal.dstProtocol}</DataTd>
                    <DataTd>{signal.netDeltaApy.toFixed(2)}%</DataTd>
                    <DataTd>
                      <StatusPill tone={signal.status === "failed" ? "critical" : signal.status === "pending" ? "warning" : "healthy"}>
                        {signal.status}
                      </StatusPill>
                    </DataTd>
                    <DataTd>{signal.suggestedAmountUsdc.toLocaleString()}</DataTd>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Critical Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.alerts.alerts ?? []).slice(0, 5).map((alert) => (
              <div key={alert.id} className="rounded-xl border border-[rgb(var(--neutral-5))] bg-[rgb(var(--neutral-2))] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--neutral-10))]">{alert.severity}</p>
                <p className="mt-1 text-sm text-[rgb(var(--primary-12))]">{alert.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <LiveEvents />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-[rgb(var(--primary-2))]">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[rgb(var(--primary-11))]">{label}</p>
        <p className="text-2xl font-semibold text-[rgb(var(--primary-12))]">{value}</p>
      </CardContent>
    </Card>
  );
}
