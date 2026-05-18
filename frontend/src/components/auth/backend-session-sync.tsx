"use client";

import { useEffect, useRef } from "react";
import { orcaApi } from "@/lib/api";
import { useCurrentWallet } from "./current-wallet";

const JWT_KEY = "orca_jwt";

export function BackendSessionSync() {
  const { ready, authenticated, isDemoMode, walletAddress } = useCurrentWallet();
  const syncing = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function syncJwtFromPrivy() {
      if (!ready) {
        return;
      }

      if (!authenticated) {
        localStorage.removeItem(JWT_KEY);
        syncing.current = false;
        return;
      }

      if (isDemoMode) {
        localStorage.removeItem(JWT_KEY);
        syncing.current = false;
        return;
      }

      if (!walletAddress || syncing.current) {
        return;
      }

      const existing = localStorage.getItem(JWT_KEY);
      if (existing) {
        return;
      }

      syncing.current = true;
      try {
        const nonce = await orcaApi.authNonce(walletAddress);
        const verified = await orcaApi.authVerify({
          address: walletAddress,
          signature: "privy-session",
          nonce: nonce.nonce,
        });
        if (!mounted) {
          return;
        }
        localStorage.setItem(JWT_KEY, verified.token);
      } catch {
        // Keep auth gate independent from backend bootstrap retries.
      } finally {
        syncing.current = false;
      }
    }

    void syncJwtFromPrivy();
    return () => {
      mounted = false;
    };
  }, [authenticated, isDemoMode, ready, walletAddress]);

  return null;
}
