"use client";

import type { VaultHoldingRecord } from "@orca/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TxLink } from "@/components/ui/tx-link";
import { VaultHoldingCard } from "@/components/wallet/vault-holding-card";
import { orcaApi } from "@/lib/api";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";
import { withdrawStubVaultHolding } from "@/lib/stub-vault-withdraw";

export function PositionsPage() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);
  const [holdings, setHoldings] = useState<VaultHoldingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<{ chainId: number; txHash: string } | null>(null);

  const loadHoldings = useCallback(async () => {
    if (!walletAddress) return;
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const next = await orcaApi.myVaultHoldings(null, walletAddress);
      setHoldings(next.holdings);
    } catch (err) {
      setHoldings([]);
      setError(err instanceof Error ? err.message : "Unable to load vault holdings");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const withdrawHolding = async (holding: VaultHoldingRecord) => {
    if (!walletAddress || withdrawingId) return;
    setWithdrawError(null);
    setWithdrawTx(null);
    setWithdrawingId(holding.id);
    try {
      const txHash = await withdrawStubVaultHolding({ holding, ownerAddress: walletAddress, wallets });
      setWithdrawTx({ chainId: holding.chainId, txHash });
      await loadHoldings();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setWithdrawingId(null);
    }
  };

  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadHoldings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authenticated, walletAddress, loadHoldings]);

  const visibleHoldings = authenticated && walletAddress ? holdings : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Holdings</CardTitle>
            <p className="text-sm text-[#5c564c]">Indexed on-chain balances across configured vaults.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!authenticated ? <p className="text-sm text-[#5c564c]">Connect wallet to view vault holdings.</p> : null}
        {authenticated && loading ? <p className="text-sm text-[#5c564c]">Loading vault holdings...</p> : null}
        {error ? <p className="text-sm text-[rgb(var(--danger-11))]">{error}</p> : null}
        {withdrawError ? <p className="text-sm text-red-700">{withdrawError}</p> : null}
        {withdrawTx ? (
          <p className="text-sm text-[#2d5016]">
            Withdraw submitted: <TxLink txHash={withdrawTx.txHash} chainId={withdrawTx.chainId} />
          </p>
        ) : null}
        {authenticated && !loading && !error ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleHoldings.map((holding) => {
              const canWithdraw = BigInt(holding.balanceRaw || "0") > BigInt(0);
              const busy = withdrawingId === holding.id;
              return (
                <VaultHoldingCard
                  key={holding.id}
                  holding={holding}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!authenticated || !walletAddress || !canWithdraw || busy || Boolean(withdrawingId)}
                      onClick={() => void withdrawHolding(holding)}
                    >
                      {busy ? "Withdrawing..." : "Withdraw"}
                    </Button>
                  }
                />
              );
            })}
          </div>
        ) : null}
        {authenticated && !loading && !error && visibleHoldings.length === 0 ? (
          <p className="mt-3 text-sm text-[#5c564c]">No configured vault balances were found for this wallet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
