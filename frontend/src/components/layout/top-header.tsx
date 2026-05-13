"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { orcaApi } from "@/lib/api";

export function TopHeader() {
  const [block, setBlock] = useState<number | null>(null);
  const [chain, setChain] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await orcaApi.chainStatus();
        if (!mounted) return;
        setBlock(data.network.latestBlock);
        setChain(data.network.chainId);
      } catch {
        if (!mounted) return;
        setBlock(null);
      }
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-[rgb(var(--primary-6))] bg-[rgb(var(--neutral-1))] px-6 py-3">
      <div>
        <p className="text-sm font-semibold text-[rgb(var(--primary-12))]">On-chain Risk Coordination Architecture</p>
        <p className="text-xs text-[rgb(var(--primary-11))]">Contracts + API + Frontend phase (agents excluded)</p>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="info">Chain {chain ?? "--"}</Badge>
        <Badge tone="neutral">Block {block ?? "--"}</Badge>
      </div>
    </header>
  );
}
