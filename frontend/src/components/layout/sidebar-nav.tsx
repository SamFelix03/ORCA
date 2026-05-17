"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", mark: "D" },
  { label: "Holdings", href: "/positions", mark: "H" },
  { label: "Agents", href: "/agents", mark: "A" },
  { label: "Signals", href: "/signals", mark: "S" },
  // { label: "Treasury", href: "/treasury", mark: "T" },
  { label: "PoAI", href: "/poai", mark: "I" },
  { label: "Marketplace", href: "/marketplace", mark: "M" },
  { label: "Settings", href: "/settings", mark: "R" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-r-2 border-[#fffaf0] bg-[#171717] text-[#fffaf0]"
                : "text-[#8d877c] hover:bg-[#171717] hover:text-[#fffaf0]",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-sm border text-[10px] font-bold",
                active ? "border-[#fffaf0] text-[#fffaf0]" : "border-[#3a352e] text-[#8d877c]",
              )}
            >
              {item.mark}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
