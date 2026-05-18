"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { useCurrentWallet } from "./current-wallet";
import { getStoredOrcaBackendUrl } from "@/lib/config";

const LOGIN_ROUTE = "/sign-in";

export function PrivyAuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, isDemoMode } = useCurrentWallet();
  const pathname = usePathname();
  const router = useRouter();
  const onLoginRoute = pathname === LOGIN_ROUTE;
  const hasBackendUrl = isDemoMode || Boolean(getStoredOrcaBackendUrl());

  useEffect(() => {
    if (!ready) {
      return;
    }
    if ((!authenticated || !hasBackendUrl) && !onLoginRoute) {
      router.replace(LOGIN_ROUTE);
      return;
    }
    if (authenticated && hasBackendUrl && onLoginRoute) {
      router.replace("/");
    }
  }, [authenticated, hasBackendUrl, onLoginRoute, ready, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0]" aria-label="Loading">
        <Icon icon={Loading03Icon} size={32} className="animate-spin text-black" />
      </div>
    );
  }

  if ((!authenticated || !hasBackendUrl) && !onLoginRoute) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0] text-sm text-[#5c564c]">
        Redirecting to sign in...
      </div>
    );
  }

  if (authenticated && hasBackendUrl && onLoginRoute) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0] text-sm text-[#5c564c]">
        Redirecting to dashboard...
      </div>
    );
  }

  return <>{children}</>;
}
