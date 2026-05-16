"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import { WalletPortfolioCard } from "@/components/wallet/wallet-portfolio-card";
import { LiveEvents } from "@/components/live-events";

const AGENT_FLOW = ["scout", "risk", "executor", "audit"];

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

  const activeAgents = data?.agents.agents.filter((item) => item.online).length ?? 0;
  const pendingSessions = data?.sessions.sessions.filter((item) => item.status === "pending").length ?? 0;
  const acceptedSignals = data?.signals.signals.filter((item) => ["approved", "executing", "executed"].includes(item.status)).length ?? 0;
  const portfolioValue = data?.positions.positions.reduce((sum, item) => sum + item.amountUsdc, 0) ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-black">Dashboard</h2>
          <p className="mt-1 text-sm text-[#5c564c]">Portfolio state and the live agent handoff.</p>
        </div>
      </header>

      {error ? <p className="rounded border border-[rgb(var(--danger-6))] bg-[rgb(var(--danger-2))] px-4 py-3 text-sm text-[rgb(var(--danger-12))]">{error}</p> : null}

      <WalletPortfolioCard />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Portfolio" value={loading ? "--" : `$${portfolioValue.toLocaleString()}`} />
        <MetricCard label="Online Agents" value={loading ? "--" : `${activeAgents}/4`} />
        <MetricCard label="Accepted Signals" value={loading ? "--" : String(acceptedSignals)} />
        <MetricCard label="Session Requests" value={loading ? "--" : String(pendingSessions)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Agent Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {AGENT_FLOW.map((type) => {
                const agent = data?.agents.agents.find((item) => item.type === type);
                return (
                  <div key={type} className="rounded border border-black/[0.08] bg-[#fffaf0] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5c564c]">{type}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold capitalize text-black">{type} Agent</span>
                      <StatusPill tone={agent?.online ? "healthy" : "muted"}>{agent?.online ? "online" : "idle"}</StatusPill>
                    </div>
                    <p className="mt-3 text-xs text-[#5c564c]">
                      Spend {agent ? `${agent.spendingUsedUsdc}/${agent.spendingCapUsdc}` : "--"} USDC
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Treasury</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-black">
              {loading || !data ? "--" : `$${data.treasury.treasury.balanceUsdc.toLocaleString()}`}
            </p>
            <p className="mt-2 text-sm text-[#5c564c]">Ash multisig balance</p>
          </CardContent>
        </Card>
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
                    <DataTd>{`${signal.srcProtocol} -> ${signal.dstProtocol}`}</DataTd>
                    <DataTd>{signal.netDeltaApy.toFixed(2)}%</DataTd>
                    <DataTd>
                      <StatusPill tone={signal.status === "failed" ? "critical" : signal.status === "pending" ? "warning" : "healthy"}>
                        {signal.status}
                      </StatusPill>
                    </DataTd>
                    <DataTd>{signal.suggestedAmountUsdc.toLocaleString()} USDC</DataTd>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.alerts.alerts ?? []).slice(0, 5).map((alert) => (
              <div key={alert.id} className="rounded border border-black/[0.08] bg-[#fffaf0] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5c564c]">{alert.severity}</p>
                <p className="mt-1 text-sm text-black">{alert.message}</p>
              </div>
            ))}
            {!loading && (data?.alerts.alerts.length ?? 0) === 0 ? <p className="text-sm text-[#5c564c]">No active alerts.</p> : null}
          </CardContent>
        </Card>
      </section>

      <LiveEvents />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">{label}</p>
        <p className="text-2xl font-semibold text-black">{value}</p>
      </CardContent>
    </Card>
  );
}
