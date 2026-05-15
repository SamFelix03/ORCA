"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { orcaApi } from "@/lib/api";
import { connectOrcaEvents } from "@/lib/ws";
import { useOrcaResource } from "./use-orca-resource";

export function SignalsPage() {
  const { data, loading, error, reload } = useOrcaResource(() => orcaApi.signals(), []);

  useEffect(() => {
    const ws = connectOrcaEvents((event) => {
      if (event.type === "signal.created" || event.type === "signal.updated" || event.type === "execution.settled") {
        void reload();
      }
    });

    return () => ws.close();
  }, [reload]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
        <p className="text-sm text-[rgb(var(--primary-11))]">Live strategy opportunities and risk decisions.</p>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[rgb(var(--primary-11))]">Loading signals...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>ID</DataTh>
                <DataTh>Route</DataTh>
                <DataTh>Net APY</DataTh>
                <DataTh>Amount</DataTh>
                <DataTh>Status</DataTh>
                <DataTh>Risk Reason</DataTh>
                <DataTh>Tx Hash</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.signals ?? []).map((signal) => (
                <tr key={signal.id}>
                  <DataTd>{signal.id}</DataTd>
                  <DataTd>{signal.srcChain} → {signal.dstChain}</DataTd>
                  <DataTd>{signal.netDeltaApy.toFixed(2)}%</DataTd>
                  <DataTd>{signal.suggestedAmountUsdc.toLocaleString()}</DataTd>
                  <DataTd>
                    <StatusPill tone={signal.status === "failed" ? "critical" : signal.status === "pending" ? "warning" : "healthy"}>
                      {signal.status}
                    </StatusPill>
                  </DataTd>
                  <DataTd>{signal.riskDecisionReason ?? "-"}</DataTd>
                  <DataTd className="font-mono text-xs">{signal.txHash ?? "-"}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </CardContent>
    </Card>
  );
}
