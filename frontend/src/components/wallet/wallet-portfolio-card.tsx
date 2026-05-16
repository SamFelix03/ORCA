"use client";

import type { DepositRecord, PositionRecord } from "@orca/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { orcaApi } from "@/lib/api";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

function shortAddress(address: string | null) {
  if (!address) return "--";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenBalance(token: string, positions: PositionRecord[], deposits: DepositRecord[]) {
  const normalized = token.toLowerCase();
  const fromPositions = positions
    .filter((item) => item.asset.toLowerCase() === normalized)
    .reduce((sum, item) => sum + item.amountUsdc, 0);
  const fromDeposits = deposits
    .filter((item) => item.token.toLowerCase() === normalized)
    .reduce((sum, item) => sum + item.amountUsdc, 0);
  return fromPositions + fromDeposits;
}

function formatBalance(value: number | null) {
  if (value === null) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function WalletPortfolioCard() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);

  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const [pos, dep] = await Promise.all([orcaApi.myPositions(null, walletAddress), orcaApi.myDeposits(null, walletAddress)]);
        if (cancelled) return;
        setPositions(pos.positions);
        setDeposits(dep.deposits);
      } catch {
        if (cancelled) return;
        setPositions([]);
        setDeposits([]);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authenticated, walletAddress]);

  const balances = useMemo(
    () => ({
      usdt: tokenBalance("USDT", positions, deposits),
      pieusd: tokenBalance("PIEUSD", positions, deposits),
    }),
    [positions, deposits],
  );

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
      </CardContent>
    </Card>
  );
}
