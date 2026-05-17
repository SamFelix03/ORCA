import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { explorerTxUrl, shortTxHash } from "@/lib/format-chain";

export function TxLink({
  txHash,
  chainId = 2368,
  label,
  className = "",
}: {
  txHash: string;
  chainId?: number | null;
  label?: string;
  className?: string;
}) {
  return (
    <a
      className={`inline-flex items-center gap-1 font-mono underline underline-offset-2 ${className}`}
      href={explorerTxUrl(chainId, txHash)}
      target="_blank"
      rel="noreferrer"
    >
      <span>{label ?? shortTxHash(txHash)}</span>
      <Icon icon={ArrowUpRight01Icon} size={12} />
    </a>
  );
}
