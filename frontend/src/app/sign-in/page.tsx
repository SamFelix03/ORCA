"use client";

import Image from "next/image";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentWallet } from "@/components/auth/current-wallet";
import { Button } from "@/components/ui/button";
import {
  getStoredOrcaBackendUrl,
  setStoredOrcaBackendUrl,
  validateOrcaBackendUrl,
} from "@/lib/config";

export default function SignInPage() {
  const router = useRouter();
  const { ready } = usePrivy();
  const { login } = useLogin();
  const { authenticated, enableDemoMode } = useCurrentWallet();
  const [backendUrl, setBackendUrl] = useState("");
  const [validatedBackendUrl, setValidatedBackendUrl] = useState<string | null>(null);
  const [backendState, setBackendState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [backendMessage, setBackendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authenticated && getStoredOrcaBackendUrl()) {
      router.replace("/");
    }
  }, [authenticated, router, validatedBackendUrl]);

  useEffect(() => {
    setBackendUrl(getStoredOrcaBackendUrl() ?? "");
  }, []);

  async function verifyBackend() {
    setBackendState("checking");
    setBackendMessage(null);
    setValidatedBackendUrl(null);

    try {
      const normalized = await validateOrcaBackendUrl(backendUrl);
      setStoredOrcaBackendUrl(normalized);
      setBackendUrl(normalized);
      setValidatedBackendUrl(normalized);
      setBackendState("valid");
      setBackendMessage("Backend connected.");
    } catch (err) {
      setBackendState("invalid");
      setBackendMessage(
        err instanceof Error
          ? err.message
          : "Set up the ORCA backend, then enter its https:// URL again.",
      );
    }
  }

  function updateBackendUrl(value: string) {
    setBackendUrl(value);
    setValidatedBackendUrl(null);
    setBackendState("idle");
    setBackendMessage(null);
  }

  function enterDemoMode() {
    enableDemoMode();
    router.replace("/");
  }

  const canLogin = ready && !authenticated && backendState === "valid" && validatedBackendUrl === backendUrl;

  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf0] p-6 text-black">
      <section className="flex w-full max-w-lg flex-col items-center text-center">
        <Image src="/orca-logo-light-bg.png" width={280} height={86} alt="ORCA" priority className="h-auto w-72 max-w-full" />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Connect to ORCA</h1>
        <div className="mt-8 w-full max-w-sm space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c564c]" htmlFor="backend-url">
            Backend URL
          </label>
          <div className="flex gap-2">
            <input
              id="backend-url"
              className="h-10 min-w-0 flex-1 rounded border border-black/15 bg-[#fffdf8] px-3 font-mono text-sm text-black outline-none transition-colors placeholder:text-[#8a8174] focus:border-black"
              value={backendUrl}
              onChange={(event) => updateBackendUrl(event.target.value)}
              placeholder="your url here"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => void verifyBackend()}
              disabled={!backendUrl.trim() || backendState === "checking"}
            >
              {backendState === "checking" ? "Testing" : "Test"}
            </Button>
          </div>
          {backendMessage ? (
            <p className={backendState === "valid" ? "text-center text-xs text-[#2d5016]" : "text-center text-xs text-[rgb(var(--warning-11))]"}>
              {backendMessage}
            </p>
          ) : (
            <p className="text-center text-xs text-[#5c564c]">Enter your deployed ORCA API URL and test it before connecting a wallet.</p>
          )}
        </div>
        <Button type="button" className="mt-5 min-w-48" onClick={() => login()} disabled={!canLogin}>
          {authenticated ? "Connected" : "Connect wallet"}
        </Button>
        <Button type="button" variant="secondary" className="mt-3 min-w-48" onClick={enterDemoMode} disabled={authenticated}>
          Demo mode
        </Button>
      </section>
    </main>
  );
}
