"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";

const LOGIN_ROUTE = "/sign-in";

export function PrivyAuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const pathname = usePathname();
  const router = useRouter();
  const onLoginRoute = pathname === LOGIN_ROUTE;

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!authenticated && !onLoginRoute) {
      router.replace(LOGIN_ROUTE);
      return;
    }
    if (authenticated && onLoginRoute) {
      router.replace("/");
    }
  }, [authenticated, onLoginRoute, ready, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0]" aria-label="Loading">
        <Icon icon={Loading03Icon} size={32} className="animate-spin text-black" />
      </div>
    );
  }

  if (!authenticated && !onLoginRoute) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0] text-sm text-[#5c564c]">
        Redirecting to sign in...
      </div>
    );
  }

  if (authenticated && onLoginRoute) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffaf0] text-sm text-[#5c564c]">
        Redirecting to dashboard...
      </div>
    );
  }

  return <>{children}</>;
}
