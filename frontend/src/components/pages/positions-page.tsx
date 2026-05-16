"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { orcaApi } from "@/lib/api";
import { useOrcaResource } from "./use-orca-resource";

export function PositionsPage() {
  const { data, loading, error } = useOrcaResource(() => orcaApi.vaultHoldings(), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vault Holdings</CardTitle>
        <p className="text-sm text-[#5c564c]">Indexed on-chain balances across configured vaults.</p>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-[#5c564c]">Loading positions...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {!loading && !error ? (
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Chain</DataTh>
                <DataTh>Protocol</DataTh>
                <DataTh>Token</DataTh>
                <DataTh>Amount</DataTh>
                <DataTh>Vault</DataTh>
                <DataTh>Updated</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(data?.holdings ?? []).map((holding) => (
                <tr key={holding.id}>
                  <DataTd>{holding.chainName}</DataTd>
                  <DataTd>{holding.protocol}</DataTd>
                  <DataTd>{holding.token}</DataTd>
                  <DataTd>{holding.amountUsdc.toLocaleString(undefined, { maximumFractionDigits: 6 })}</DataTd>
                  <DataTd className="max-w-[220px] truncate font-mono text-xs">{holding.vaultAddress}</DataTd>
                  <DataTd>{new Date(holding.updatedAt).toLocaleString()}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        {!loading && !error && (data?.holdings.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-[#5c564c]">No vault holdings indexed yet. Connect a wallet and use Reload holdings from the dashboard.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
