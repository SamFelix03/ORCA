"use client";

import type { TokenBalanceRecord } from "@orca/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { orcaApi } from "@/lib/api";
import { formatTokenBalanceAmountRaw } from "@/lib/format-chain";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

function shortAddress(address: string | null) {
  if (!address) return "--";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenBalance(symbol: string, balances: TokenBalanceRecord[]) {
  return balances.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
}

export function WalletPortfolioCard() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRecord[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingBalances(true);
      setBalanceError(null);
      try {
        const next = await orcaApi.myTokenBalances(null, walletAddress);
        if (cancelled) return;
        setTokenBalances(next.balances);
      } catch (err) {
        if (cancelled) return;
        setTokenBalances([]);
        setBalanceError(err instanceof Error ? err.message : "Unable to load wallet balances");
      } finally {
        if (!cancelled) {
          setLoadingBalances(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const balances = useMemo(() => {
    const source = walletAddress ? tokenBalances : [];
    return {
      usdt: tokenBalance("USDT", source),
      pieusd: tokenBalance("PIEUSD", source) ?? tokenBalance("pieUSD", source),
    };
  }, [tokenBalances, walletAddress]);

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">Wallet</p>
          <p className="mt-1 font-mono text-sm text-black">{shortAddress(walletAddress)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">USDT Balance</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {loadingBalances ? "..." : balances.usdt ? formatTokenBalanceAmountRaw(balances.usdt.raw, balances.usdt.decimals) : "0.000"} USDT
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]">PIEUSD Balance</p>
          <p className="mt-1 text-xl font-semibold text-black">
            {loadingBalances ? "..." : balances.pieusd ? formatTokenBalanceAmountRaw(balances.pieusd.raw, balances.pieusd.decimals) : "0.000"} pieUSD
          </p>
        </div>
        {walletAddress && balanceError ? <p className="sm:col-span-3 text-xs text-[rgb(var(--danger-11))]">{balanceError}</p> : null}
      </CardContent>
    </Card>
  );
}
