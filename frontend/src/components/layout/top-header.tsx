"use client";

import type { TokenBalanceRecord } from "@orca/shared";
import { CheckmarkCircle02Icon, Copy01Icon, Logout03Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useCurrentWallet } from "@/components/auth/current-wallet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { orcaApi } from "@/lib/api";
import { formatTokenBalanceAmountRaw } from "@/lib/format-chain";

function shortAddress(address: string | null) {
  if (!address) return "No wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenBalance(symbol: string, balances: TokenBalanceRecord[]) {
  return balances.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
}

export function TopHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const { isDemoMode, signOut: endCurrentWalletSession, walletAddress } = useCurrentWallet();
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRecord[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;
    const address = walletAddress;
    async function load() {
      setLoadingBalances(true);
      try {
        const next = await orcaApi.myTokenBalances(null, address);
        if (!cancelled) setTokenBalances(next.balances);
      } catch {
        if (!cancelled) setTokenBalances([]);
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const balances = useMemo(() => ({
    usdt: tokenBalance("USDT", tokenBalances),
    pieusd: tokenBalance("PIEUSD", tokenBalances) ?? tokenBalance("pieUSD", tokenBalances),
  }), [tokenBalances]);

  async function handleSignOut() {
    await endCurrentWalletSession();
  }

  async function copyWalletAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-black/[0.08] bg-[#fffaf0]/90 px-4 backdrop-blur-xl sm:px-8 lg:left-64">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded border border-black/15 text-lg leading-none text-black lg:hidden"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
        >
          <Icon icon={Menu01Icon} size={18} />
        </button>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="h-2 w-2 rounded-full bg-black" />
          <span className="text-xs font-medium text-[#5c564c]">ORCA control plane</span>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden h-8 items-center gap-3 rounded border border-black/10 bg-[#fffdf8] px-3 text-xs text-black md:flex">
          <span className="font-semibold text-[#5c564c]">USDT</span>
          <span className="font-mono font-semibold">
            {loadingBalances ? "..." : balances.usdt ? formatTokenBalanceAmountRaw(balances.usdt.raw, balances.usdt.decimals) : "0.000"}
          </span>
          <span className="h-4 w-px bg-black/10" />
          <span className="font-semibold text-[#5c564c]">pieUSD</span>
          <span className="font-mono font-semibold">
            {loadingBalances ? "..." : balances.pieusd ? formatTokenBalanceAmountRaw(balances.pieusd.raw, balances.pieusd.decimals) : "0.000"}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex h-8 max-w-[150px] items-center gap-2 rounded border border-black/10 bg-[#fffdf8] px-2.5 font-mono text-xs text-black transition-colors hover:bg-[#f5ebd8] sm:max-w-none"
          onClick={() => void copyWalletAddress()}
          title={walletAddress ? `Copy ${walletAddress}` : "No wallet connected"}
          aria-label="Copy wallet address"
        >
          <span className="truncate">{shortAddress(walletAddress)}</span>
          {isDemoMode ? <span className="hidden text-[#5c564c] sm:inline">Demo</span> : null}
          <Icon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={14} className="text-[#5c564c]" />
        </button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 w-8 px-0 text-base"
          onClick={() => void handleSignOut()}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon icon={Logout03Icon} size={16} />
        </Button>
      </div>
    </header>
  );
}
