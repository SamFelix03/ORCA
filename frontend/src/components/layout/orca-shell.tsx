"use client";

import Link from "next/link";
import Image from "next/image";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { SidebarNav } from "./sidebar-nav";
import { TopHeader } from "./top-header";

export function OrcaShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffaf0] text-black">
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col space-y-8 overflow-y-auto bg-black p-6 text-[#fffaf0] antialiased lg:flex">
        <Link href="/" className="block">
          <Image src="/orca-logo-dark-bg.png" width={176} height={52} alt="ORCA" priority className="h-auto w-36" />
        </Link>
        <SidebarNav />
        <div className="mt-auto border-t border-[#fffaf0]/10 pt-6 text-xs leading-5 text-[#8d877c]">
          Kite-native agent payments, risk checks, execution, and PoAI attribution.
        </div>
      </aside>

      <TopHeader onOpenNavigation={() => setMobileOpen(true)} />

      <main className="mt-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 sm:p-8 lg:ml-64">
        <div className="page-enter mx-auto max-w-[1440px]">{children}</div>
      </main>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] max-w-[88vw] flex-col space-y-8 bg-black p-6 text-[#fffaf0]">
            <div className="flex items-start justify-between gap-4">
              <Link href="/" onClick={() => setMobileOpen(false)}>
                <Image src="/orca-logo-dark-bg.png" width={176} height={52} alt="ORCA" priority className="h-auto w-36" />
              </Link>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded border border-[#fffaf0]/15 text-[#fffaf0]"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <Icon icon={Cancel01Icon} size={16} />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
