"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

function shortAddress(address: string | null) {
  if (!address) return "No wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function TopHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const { logout } = usePrivy();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = primaryPrivyWalletAddress(user, wallets);

  async function signOut() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("orca_jwt");
    }
    await logout();
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
          =
        </button>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="h-2 w-2 rounded-full bg-black" />
          <span className="text-xs font-medium text-[#5c564c]">ORCA control plane</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded border border-black/10 bg-[#fffdf8] px-3 py-1.5 font-mono text-xs text-black">
          {shortAddress(walletAddress)}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
