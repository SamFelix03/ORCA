"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { useOrcaResource } from "./use-orca-resource";
import { orcaApi } from "@/lib/api";

export function MarketplacePage() {
  const scouts = useOrcaResource(() => orcaApi.scouts(), []);
  const payouts = useOrcaResource(() => orcaApi.scoutPayouts(), []);
  const [did, setDid] = useState("did:kite:orca/scout-external-demo");
  const [ownerAddress, setOwnerAddress] = useState("0x0000000000000000000000000000000000000000");
  const [stakeUsdc, setStakeUsdc] = useState(100);
  const loading = scouts.loading || payouts.loading;

  async function register() {
    await orcaApi.registerScout({ did, ownerAddress, stakeUsdc });
    await scouts.reload();
  }

  const totalPending = useMemo(
    () => (payouts.data?.payouts ?? []).filter((item) => item.status === "pending").reduce((acc, item) => acc + item.amountUsdc, 0),
    [payouts.data],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bring Your Own Scout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input className="w-full rounded border px-2 py-1" value={did} onChange={(e) => setDid(e.target.value)} placeholder="Scout DID" />
          <input
            className="w-full rounded border px-2 py-1"
            value={ownerAddress}
            onChange={(e) => setOwnerAddress(e.target.value)}
            placeholder="Owner address"
          />
          <input
            className="w-full rounded border px-2 py-1"
            type="number"
            value={stakeUsdc}
            onChange={(e) => setStakeUsdc(Number(e.target.value))}
            placeholder="Stake USDC"
          />
          <Button onClick={register}>Register Scout</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered Scouts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p>Loading...</p> : null}
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>DID</DataTh>
                <DataTh>Status</DataTh>
                <DataTh>Stake (USDC)</DataTh>
                <DataTh>Reputation</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(scouts.data?.scouts ?? []).map((scout) => (
                <tr key={scout.id}>
                  <DataTd className="font-mono text-xs">{scout.did}</DataTd>
                  <DataTd>{scout.status}</DataTd>
                  <DataTd>{scout.stakeUsdc}</DataTd>
                  <DataTd>{scout.reputationScore}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout Ledger (Pending Total: {totalPending.toFixed(2)} USDC)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable>
            <DataThead>
              <tr>
                <DataTh>Scout DID</DataTh>
                <DataTh>Epoch</DataTh>
                <DataTh>Amount</DataTh>
                <DataTh>Status</DataTh>
              </tr>
            </DataThead>
            <tbody>
              {(payouts.data?.payouts ?? []).map((payout) => (
                <tr key={payout.id}>
                  <DataTd className="font-mono text-xs">{payout.scoutDid}</DataTd>
                  <DataTd>{payout.epochId}</DataTd>
                  <DataTd>{payout.amountUsdc}</DataTd>
                  <DataTd>{payout.status}</DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
