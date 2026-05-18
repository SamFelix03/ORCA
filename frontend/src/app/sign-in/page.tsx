"use client";

import Image from "next/image";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCurrentWallet } from "@/components/auth/current-wallet";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const { ready } = usePrivy();
  const { login } = useLogin();
  const { authenticated, enableDemoMode } = useCurrentWallet();

  useEffect(() => {
    if (authenticated) {
      router.replace("/");
    }
  }, [authenticated, router]);

  function enterDemoMode() {
    enableDemoMode();
    router.replace("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf0] p-6 text-black">
      <section className="flex w-full max-w-lg flex-col items-center text-center">
        <Image src="/orca-logo-light-bg.png" width={280} height={86} alt="ORCA" priority className="h-auto w-72 max-w-full" />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Connect to ORCA</h1>
        <Button type="button" className="mt-8 min-w-48" onClick={() => login()} disabled={!ready || authenticated}>
          {authenticated ? "Connected" : "Connect wallet"}
        </Button>
        <Button type="button" variant="secondary" className="mt-3 min-w-48" onClick={enterDemoMode} disabled={authenticated}>
          Demo mode
        </Button>
      </section>
    </main>
  );
}
