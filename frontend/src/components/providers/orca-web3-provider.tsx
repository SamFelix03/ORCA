"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { BackendSessionSync } from "@/components/auth/backend-session-sync";
import { CurrentWalletProvider } from "@/components/auth/current-wallet";
import { PrivyAuthGate } from "@/components/auth/privy-auth-gate";
import { wagmiConfig } from "@/lib/wagmi-config";

export function OrcaWeb3Provider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim();

  if (!appId) {
    return (
      <div className="grid min-h-screen place-items-center bg-[rgb(var(--primary-2))] p-6 text-center">
        <div className="max-w-xl rounded-2xl border border-[rgb(var(--warning-6))] bg-[rgb(var(--warning-2))] p-5 text-sm text-[rgb(var(--warning-12))]">
          Missing <span className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</span>. Add this env var to run Privy auth.
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={client}>
          <CurrentWalletProvider>
            <BackendSessionSync />
            <PrivyAuthGate>{children}</PrivyAuthGate>
          </CurrentWalletProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
