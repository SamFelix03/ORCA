"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { orcaApi } from "@/lib/api";
import { primaryPrivyWalletAddress } from "@/lib/privy-user";

const JWT_KEY = "orca_jwt";

export function BackendSessionSync() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const syncing = useRef(false);
  const walletAddress = primaryPrivyWalletAddress(user, wallets);

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
  }, [authenticated, ready, walletAddress]);

  return null;
}
