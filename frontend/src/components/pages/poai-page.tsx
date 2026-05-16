"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function PoaiPage() {
  const epochId = 1;
  const { data, loading, error } = useOrcaResource(() => orcaApi.poaiEpoch(epochId), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>PoAI Attribution (Epoch {epochId})</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[#5c564c]">Loading PoAI records...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Agent</DataTh>
                <DataTh>Action</DataTh>
                <DataTh>Value Delta</DataTh>
                <DataTh>Recorded</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.rewards ?? []).map((reward, index) => (
                <tr key={`${reward.agentDid}-${reward.createdAt}-${index}`}>
                  <DataTd className="font-mono text-xs">{reward.agentDid.split(":").at(-1) ?? reward.agentDid}</DataTd>
                  <DataTd>{reward.actionType ?? "--"}</DataTd>
                  <DataTd>{reward.valueDelta.toLocaleString()}</DataTd>
                  <DataTd>{new Date(reward.createdAt).toLocaleString()}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        {!loading && !error && (data?.rewards.length ?? 0) === 0 ? <p className="text-sm text-[#5c564c]">No on-chain PoAI records for this epoch yet.</p> : null}
      </CardContent>
    </Card>
  );
}
