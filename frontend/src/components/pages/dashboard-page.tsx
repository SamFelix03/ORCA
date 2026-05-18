"use client";

import { useEffect } from "react";
import { useCurrentWallet } from "@/components/auth/current-wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";
import { formatPieUsdPaymentAmountRaw, formatTokenBalanceAmountRaw, formatTokenNumber, tokenAmountRawToNumber } from "@/lib/format-chain";
import { VaultHoldingCard } from "@/components/wallet/vault-holding-card";
import { LiveEvents } from "@/components/live-events";
import { connectOrcaEvents } from "@/lib/ws";

const AGENT_FLOW = ["scout", "risk", "executor", "audit"];

export function DashboardPage() {
  const { walletAddress } = useCurrentWallet();
  const { data, loading, error, reload } = useOrcaResource(async () => {
    const [agents, vaultHoldings, signals, treasury, alerts] = await Promise.all([
      orcaApi.agents(),
      walletAddress ? orcaApi.refreshVaultHoldings(null, walletAddress) : Promise.resolve({ holdings: [] }),
      orcaApi.signals(),
      orcaApi.treasury(),
      orcaApi.alerts(),
    ]);

    return { agents, vaultHoldings, signals, treasury, alerts };
  }, [walletAddress]);

  useEffect(() => {
    const ws = connectOrcaEvents((event) => {
      if (
        event.type === "signal.created" ||
        event.type === "signal.updated" ||
        event.type === "execution.created" ||
        event.type === "execution.settled" ||
        event.type === "workflow.updated"
      ) {
        void reload();
      }
    });

    return () => ws.close();
  }, [reload]);

  const acceptedSignals = data?.signals.signals.filter((item) => ["approved", "executing", "executed"].includes(item.status)).length ?? 0;
  const portfolioValue = data?.vaultHoldings.holdings.reduce((sum, item) => sum + tokenAmountRawToNumber(item.balanceRaw, item.decimals), 0) ?? 0;
  const treasuryTokens = data?.treasury.treasury.tokenBalances ?? [];
  const agentPayments = data?.agents.agents.reduce((sum, item) => sum + (item.x402PaymentCount ?? item.spendingUsedUsdc), 0) ?? 0;
  const topHoldings = [...(data?.vaultHoldings.holdings ?? [])]
    .filter((item) => BigInt(item.balanceRaw || "0") > BigInt(0))
    .sort((a, b) => tokenAmountRawToNumber(b.balanceRaw, b.decimals) - tokenAmountRawToNumber(a.balanceRaw, a.decimals))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-black">Dashboard</h2>
          <p className="mt-1 text-sm text-[#5c564c]">Portfolio state and the live agent handoff.</p>
        </div>
      </header>

      {error ? <p className="rounded border border-[rgb(var(--danger-6))] bg-[rgb(var(--danger-2))] px-4 py-3 text-sm text-[rgb(var(--danger-12))]">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Indexed Vaults" value={loading ? "--" : `${formatTokenNumber(portfolioValue, 18)} USDT`} />
        <MetricCard label="Agent Payments" value={loading ? "--" : String(agentPayments)} />
        <MetricCard label="Accepted Signals" value={loading ? "--" : String(acceptedSignals)} />
        <MetricCard label="Treasury Tokens" value={loading ? "--" : String(treasuryTokens.length)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {topHoldings.map((holding) => (
              <VaultHoldingCard key={holding.id} holding={holding} />
            ))}
          </div>
          {!loading && topHoldings.length === 0 ? <p className="text-sm text-[#5c564c]">No indexed holdings yet.</p> : null}
        </CardContent>
      </Card>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Agent Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {AGENT_FLOW.map((type) => {
                const agent = data?.agents.agents.find((item) => item.type === type);
                return (
                  <div key={type} className="min-w-0 rounded border border-black/[0.08] bg-[#fffaf0] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5c564c]">{type}</p>
                    <div className="mt-3 min-w-0">
                      <span className="min-w-0 text-sm font-semibold capitalize text-black">{type} Agent</span>
                    </div>
                    <p className="mt-3 truncate text-xs text-[#5c564c]">
                      {agent ? `x402 payments: ${agent.x402PaymentCount ?? agent.spendingUsedUsdc}` : "No runtime events yet"}
                    </p>
                  </div>
                );
              })}
            </div>
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
                  <DataTh>Payment Value</DataTh>
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
                    <DataTd>
                      {signal.paymentAmountWei ? `${formatPieUsdPaymentAmountRaw(signal.paymentAmountWei)} pieUSD` : "-"}
                    </DataTd>
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
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">{label}</p>
        <p className="break-words text-xl font-semibold leading-tight text-black sm:text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
