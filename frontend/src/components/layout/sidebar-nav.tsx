"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Positions", href: "/positions" },
  { label: "Agents", href: "/agents" },
  { label: "Signals", href: "/signals" },
  { label: "Sessions", href: "/sessions" },
  { label: "Treasury", href: "/treasury" },
  { label: "PoAI", href: "/poai" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Settings", href: "/settings" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col border-r border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-2))]">
      <div className="border-b border-[rgb(var(--primary-6))] px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--primary-11))]">ORCA</p>
        <h1 className="mt-1 text-lg font-semibold text-[rgb(var(--primary-12))]">Control Plane</h1>
      </div>

      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-[rgb(var(--primary-9))] text-[rgb(var(--contrast-primary-9))]"
                      : "text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--primary-4))]"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto border-t border-[rgb(var(--primary-6))] px-4 py-4 text-xs text-[rgb(var(--primary-11))]">
        Kite Chain • L1 Agentic Settlement
      </div>
    </aside>
  );
}
