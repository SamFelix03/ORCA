"use client";

import type { ConnectedWallet } from "@privy-io/react-auth";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

export const DEMO_WALLET_ADDRESS = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";

const DEMO_MODE_KEY = "orca_demo_mode";
const JWT_KEY = "orca_jwt";

type CurrentWalletContextValue = {
  ready: boolean;
  authenticated: boolean;
  isDemoMode: boolean;
  walletAddress: string | null;
  wallets: ConnectedWallet[];
  enableDemoMode: () => void;
  signOut: () => Promise<void>;
};

const CurrentWalletContext = createContext<CurrentWalletContextValue | null>(null);

function readInitialDemoMode() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_MODE_KEY) === "1";
}

export function CurrentWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready: privyReady, authenticated: privyAuthenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const [isDemoMode, setIsDemoMode] = useState(readInitialDemoMode);

  const privyWalletAddress = primaryPrivyWalletAddress(user, wallets);
  const walletAddress = isDemoMode ? DEMO_WALLET_ADDRESS : privyWalletAddress;
  const ready = isDemoMode || privyReady;
  const authenticated = isDemoMode || privyAuthenticated;

  const enableDemoMode = useCallback(() => {
    localStorage.setItem(DEMO_MODE_KEY, "1");
    localStorage.removeItem(JWT_KEY);
    setIsDemoMode(true);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DEMO_MODE_KEY);
    localStorage.removeItem(JWT_KEY);
    setIsDemoMode(false);
    if (privyAuthenticated) {
      await logout();
    }
  }, [logout, privyAuthenticated]);

  const value = useMemo<CurrentWalletContextValue>(
    () => ({
      ready,
      authenticated,
      isDemoMode,
      walletAddress,
      wallets: isDemoMode ? [] : wallets,
      enableDemoMode,
      signOut,
    }),
    [authenticated, enableDemoMode, isDemoMode, ready, signOut, walletAddress, wallets],
  );

  return <CurrentWalletContext.Provider value={value}>{children}</CurrentWalletContext.Provider>;
}

export function useCurrentWallet() {
  const context = useContext(CurrentWalletContext);
  if (!context) {
    throw new Error("useCurrentWallet must be used within CurrentWalletProvider");
  }
  return context;
}
