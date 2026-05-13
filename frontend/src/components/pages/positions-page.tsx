"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function PositionsPage() {
  const { data, loading, error } = useOrcaResource(() => orcaApi.positions(), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <p className="text-sm text-[rgb(var(--primary-11))]">Cross-chain DeFi exposure and health metrics.</p>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[rgb(var(--primary-11))]">Loading positions...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Chain</DataTh>
                <DataTh>Protocol</DataTh>
                <DataTh>Asset</DataTh>
                <DataTh>Amount (USDC)</DataTh>
                <DataTh>APY</DataTh>
                <DataTh>Health</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.positions ?? []).map((position) => (
                <tr key={position.id}>
                  <DataTd>{position.chainName}</DataTd>
                  <DataTd>{position.protocol}</DataTd>
                  <DataTd>{position.asset}</DataTd>
                  <DataTd>{position.amountUsdc.toLocaleString()}</DataTd>
                  <DataTd>{position.apy.toFixed(2)}%</DataTd>
                  <DataTd>
                    <StatusPill tone={position.healthFactor < 1.15 ? "critical" : position.healthFactor < 1.5 ? "warning" : "healthy"}>
                      HF {position.healthFactor.toFixed(2)}
                    </StatusPill>
                  </DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </CardContent>
    </Card>
  );
}
