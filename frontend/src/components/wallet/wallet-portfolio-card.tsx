"use client";

import type { DepositRecord, PositionRecord } from "@orca/shared";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orcaApi } from "@/lib/api";

const JWT_KEY = "orca_jwt";

export function WalletPortfolioCard() {
  const { address, isConnected } = useConnection();
  const { connect, status: connectStatus } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setToken(localStorage.getItem(JWT_KEY));
  }, []);

  const loadPortfolio = useCallback(async (jwt: string | null, walletAddr: string | undefined) => {
    if (!walletAddr && !jwt) {
      return;
    }
    setLoadingPortfolio(true);
    setError(null);
    try {
      const [pos, dep] = await Promise.all([
        orcaApi.myPositions(jwt, walletAddr),
        orcaApi.myDeposits(jwt, walletAddr),
      ]);
      setPositions(pos.positions);
      setDeposits(dep.deposits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    if (!address) {
      return;
    }
    void loadPortfolio(token, address);
  }, [address, token, loadPortfolio]);

  const onSignIn = async () => {
    if (!address) {
      return;
    }
    setError(null);
    try {
      const nonce = await orcaApi.authNonce(address);
      const signature = await signMessageAsync({ message: nonce.message });
      const verified = await orcaApi.authVerify({
        address,
        signature,
        nonce: nonce.nonce,
      });
      localStorage.setItem(JWT_KEY, verified.token);
      setToken(verified.token);
      await loadPortfolio(verified.token, address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  const onSignOut = () => {
    localStorage.removeItem(JWT_KEY);
    setToken(null);
    setPositions([]);
    setDeposits([]);
    disconnect();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Wallet &amp; portfolio</CardTitle>
        <div className="flex flex-wrap gap-2">
          {!isConnected
            ? connectors.map((c) => (
                <Button
                  key={c.uid}
                  size="sm"
                  variant="secondary"
                  disabled={connectStatus === "pending"}
                  onClick={() => connect({ connector: c })}
                >
                  {c.name}
                </Button>
              ))
            : null}
          {isConnected ? (
            <Button size="sm" variant="outline" onClick={() => void onSignIn()} disabled={isSigning}>
              {token ? "Refresh session" : "Sign in (SIWE-style)"}
            </Button>
          ) : null}
          {isConnected ? (
            <Button size="sm" variant="ghost" onClick={onSignOut}>
              Disconnect
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-[rgb(var(--primary-11))]">
          {address ? <span className="font-mono text-xs">{address}</span> : "Connect a wallet (injected or WalletConnect with project id)."}
        </p>
        {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? (
          <p className="text-xs text-[rgb(var(--neutral-11))]">
            Set <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span> for mobile / WalletConnect
            QR.
          </p>
        ) : null}
        {error ? <p className="text-[rgb(var(--danger-11))]">{error}</p> : null}
        {token ? (
          <p className="text-xs text-[rgb(var(--neutral-11))]">Signed in — API calls can use your session; portfolio already loads from the connected address.</p>
        ) : isConnected ? (
          <p className="text-xs text-[rgb(var(--neutral-11))]">
            Portfolio loads from this address via <span className="font-mono">?wallet=</span> (no JWT required for this demo tier). Sign in only if you want a session token for future stricter routes.
          </p>
        ) : null}

        {loadingPortfolio ? <p className="text-[rgb(var(--primary-11))]">Loading portfolio…</p> : null}

        {positions.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-[rgb(var(--primary-12))]">Positions</p>
            <ul className="space-y-1 font-mono text-xs">
              {positions.map((p) => (
                <li key={p.id}>
                  {p.chainName} · {p.protocol} · {p.amountUsdc.toLocaleString()} {p.asset} @ {p.apy}% HF {p.healthFactor}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {deposits.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold text-[rgb(var(--primary-12))]">Deposits</p>
            <ul className="space-y-1 font-mono text-xs">
              {deposits.map((d) => (
                <li key={d.id}>
                  chain {d.chainId} · {d.amountUsdc.toLocaleString()} {d.token}
                  {d.destination ? ` → ${d.destination}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isConnected && !loadingPortfolio && positions.length === 0 && deposits.length === 0 ? (
          <p className="text-[rgb(var(--neutral-11))]">No positions or deposits linked to this wallet in the API.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
