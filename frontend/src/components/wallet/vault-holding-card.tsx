"use client";

import type { VaultHoldingRecord } from "@orca/shared";
import { ArrowUpRight01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TxLink } from "@/components/ui/tx-link";
import { explorerAddressUrl, formatTokenAmountRaw } from "@/lib/format-chain";

export function VaultHoldingCard({
  holding,
  action,
}: {
  holding: VaultHoldingRecord;
  action?: React.ReactNode;
}) {
  return (
    <article className="flex min-h-36 flex-col justify-between rounded border border-black/10 bg-[#fffaf0] p-3 text-xs">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-black">
          {holding.chainName} / {holding.protocol}
        </p>
        <p className="mt-2 break-words text-base font-semibold text-black">
          {formatTokenAmountRaw(holding.balanceRaw, holding.decimals)} {holding.token}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a
            href={explorerAddressUrl(holding.chainId, holding.vaultAddress)}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-7 items-center gap-1 rounded border border-black/15 bg-[#fffdf8] px-2 text-[11px] font-semibold text-black hover:bg-black"
          >
            <span className="group-hover:text-[#fffaf0]">View vault</span>
            <Icon icon={ArrowUpRight01Icon} size={11} className="group-hover:text-[#fffaf0]" />
          </a>
          {holding.sourceTxHash ? (
            <TxLink txHash={holding.sourceTxHash} chainId={holding.chainId} className="text-[11px]" />
          ) : (
            <span className="text-[11px] text-[#5c564c]">No source tx</span>
          )}
        </div>
        {action}
      </div>
    </article>
  );
}

export function ReloadButton({
  onClick,
  disabled,
  busy,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="bg-black px-3 text-[#fffaf0] hover:bg-[#2a2a2a] disabled:opacity-50"
      title="Reload holdings"
    >
      <Icon icon={RefreshIcon} size={13} className={busy ? "animate-spin" : undefined} />
      <span className="ml-1">{busy ? "reloading" : "reload"}</span>
    </Button>
  );
}
