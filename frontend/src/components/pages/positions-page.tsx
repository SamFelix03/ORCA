"use client";

import type { VaultHoldingRecord } from "@orca/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTd, DataTh, DataThead } from "@/components/ui/data-table";
import { orcaApi } from "@/lib/api";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

export function PositionsPage() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);
  const [holdings, setHoldings] = useState<VaultHoldingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHoldings = async () => {
    if (!walletAddress || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const next = await orcaApi.refreshVaultHoldings(null, walletAddress);
      setHoldings(next.holdings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh vault holdings");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const existing = await orcaApi.myVaultHoldings(null, walletAddress);
        if (cancelled) return;
        if (existing.holdings.length > 0) {
          setHoldings(existing.holdings);
          return;
        }
        const refreshed = await orcaApi.refreshVaultHoldings(null, walletAddress);
        if (!cancelled) {
          setHoldings(refreshed.holdings);
        }
      } catch (err) {
        if (!cancelled) {
          setHoldings([]);
          setError(err instanceof Error ? err.message : "Unable to load vault holdings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authenticated, walletAddress]);

  const visibleHoldings = authenticated && walletAddress ? holdings : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Vault Holdings</CardTitle>
            <p className="text-sm text-[#5c564c]">Indexed on-chain balances across configured vaults.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refreshHoldings} disabled={!walletAddress || refreshing}>
            {refreshing ? "Reloading..." : "Reload holdings"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!authenticated ? <p className="text-sm text-[#5c564c]">Connect wallet to view vault holdings.</p> : null}
        {authenticated && loading ? <p className="text-sm text-[#5c564c]">Loading vault holdings...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}

        {authenticated && !loading && !error ? (
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
              {visibleHoldings.map((holding) => (
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
        {authenticated && !loading && !error && visibleHoldings.length === 0 ? (
          <p className="mt-3 text-sm text-[#5c564c]">No configured vault balances were found for this wallet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
