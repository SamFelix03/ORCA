"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function TreasuryPage() {
  const { data, loading, error } = useOrcaResource(async () => {
    const [treasury, pending, chain] = await Promise.all([
      orcaApi.treasury(),
      orcaApi.pendingMultisig(),
      orcaApi.chainStatus(),
    ]);

    return { treasury, pending, chain };
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Treasury Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading ? <p className="text-[rgb(var(--primary-11))]">Loading treasury...</p> : null}
          {error ? <p className="text-[rgb(var(--danger-11))]">{error}</p> : null}

          {!loading && !error && data ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Balance</span>
                <span className="text-xl font-semibold">{data.treasury.treasury.balanceUsdc.toLocaleString()} USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Threshold</span>
                <Badge tone="info">{data.treasury.treasury.threshold}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Registry Epoch</span>
                <span>{data.chain.registryEpoch ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[rgb(var(--primary-11))]">Latest Block</span>
                <span>{data.chain.network.latestBlock}</span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Multisig Proposals</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && !error && data ? (
            <DataTable>
              <DataThead>
                <tr>
                  <DataTh>ID</DataTh>
                  <DataTh>To</DataTh>
                  <DataTh>Value</DataTh>
                  <DataTh>Approvals</DataTh>
                </tr>
              </DataThead>
              <tbody>
                {data.pending.pending.map((item) => (
                  <tr key={item.id}>
                    <DataTd>{item.id}</DataTd>
                    <DataTd className="font-mono text-xs">{item.to}</DataTd>
                    <DataTd>{item.valueUsdc.toLocaleString()} USDC</DataTd>
                    <DataTd>{item.approvals}/{item.required}</DataTd>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
