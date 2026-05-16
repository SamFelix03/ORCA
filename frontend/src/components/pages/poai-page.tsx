"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function PoaiPage() {
  const { data, loading, error } = useOrcaResource(() => orcaApi.poaiEpoch(42), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>PoAI Rewards (Epoch 42)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[#5c564c]">Loading rewards...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Agent</DataTh>
                <DataTh>KITE Reward</DataTh>
                <DataTh>Signals</DataTh>
                <DataTh>Acceptance</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.rewards ?? []).map((reward, index) => (
                <tr key={`${reward.agentDid}-${index}`}>
                  <DataTd className="font-mono text-xs">{reward.agentDid.split(":").at(-1) ?? reward.agentDid}</DataTd>
                  <DataTd>{reward.amountKite.toFixed(2)}</DataTd>
                  <DataTd>{reward.signalsCount ?? "-"}</DataTd>
                  <DataTd>{reward.acceptanceRate !== undefined ? `${(reward.acceptanceRate * 100).toFixed(1)}%` : "-"}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </CardContent>
    </Card>
  );
}
