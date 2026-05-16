"use client";

import type { DepositRecord, VaultHoldingRecord } from "@orca/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { orcaApi } from "@/lib/api";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

function shortAddress(address: string | null) {
  if (!address) return "--";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenBalance(token: string, deposits: DepositRecord[]) {
  const normalized = token.toLowerCase();
  const fromDeposits = deposits
    .filter((item) => item.token.toLowerCase() === normalized)
    .reduce((sum, item) => sum + item.amountUsdc, 0);
  return fromDeposits;
}

function formatBalance(value: number | null) {
  if (value === null) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function WalletPortfolioCard() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [holdings, setHoldings] = useState<VaultHoldingRecord[]>([]);
  const [refreshingHoldings, setRefreshingHoldings] = useState(false);

  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const [dep, vaults] = await Promise.all([
          orcaApi.myDeposits(null, walletAddress),
          orcaApi.myVaultHoldings(null, walletAddress),
        ]);
        if (cancelled) return;
        setDeposits(dep.deposits);
        if (vaults.holdings.length > 0) {
          setHoldings(vaults.holdings);
          return;
        }
        const refreshed = await orcaApi.refreshVaultHoldings(null, walletAddress);
        if (!cancelled) {
          setHoldings(refreshed.holdings);
        }
      } catch {
        if (cancelled) return;
        setDeposits([]);
        setHoldings([]);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authenticated, walletAddress]);

  const balances = useMemo(
    () => ({
      usdt: tokenBalance("USDT", deposits) + holdings.filter((item) => item.token.toLowerCase() === "usdt").reduce((sum, item) => sum + item.amountUsdc, 0),
      pieusd: tokenBalance("PIEUSD", deposits) + holdings.filter((item) => item.token.toLowerCase() === "pieusd").reduce((sum, item) => sum + item.amountUsdc, 0),
    }),
    [deposits, holdings],
  );

  const reloadHoldings = async () => {
    if (!walletAddress || refreshingHoldings) return;
    setRefreshingHoldings(true);
    try {
      const vaults = await orcaApi.refreshVaultHoldings(null, walletAddress);
      setHoldings(vaults.holdings);
    } finally {
      setRefreshingHoldings(false);
    }
  };

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Wallet</p>
          <p className="mt-1 font-mono text-sm text-black">{shortAddress(walletAddress)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">USDT Balance</p>
          <p className="mt-1 text-xl font-semibold text-black">{formatBalance(balances.usdt)} USDT</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">PIEUSD Balance</p>
          <p className="mt-1 text-xl font-semibold text-black">{formatBalance(balances.pieusd)} PIEUSD</p>
        </div>
        <div className="flex items-end justify-start sm:col-span-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reloadHoldings}
            disabled={!walletAddress || refreshingHoldings}
            title="Reload vault holdings"
          >
            {refreshingHoldings ? "Reloading..." : "Reload holdings"}
          </Button>
        </div>
        {holdings.length > 0 ? (
          <div className="border-t border-black/10 pt-3 sm:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Vault holdings</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {holdings.map((holding) => (
                <div key={holding.id} className="rounded border border-black/10 bg-[#fffaf0] p-2 text-xs">
                  <p className="font-semibold text-black">{holding.chainName} / {holding.protocol}</p>
                  <p className="mt-1 text-[#5c564c]">{formatBalance(holding.amountUsdc)} {holding.token}</p>
                  {holding.sourceTxHash ? (
                    <a className="mt-1 block break-all font-mono underline" href={`https://testnet.kitescan.ai/tx/${holding.sourceTxHash}`} target="_blank" rel="noreferrer">
                      {holding.sourceTxHash}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
