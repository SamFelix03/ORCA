import { cn } from "@/lib/cn";

type StatusTone = "healthy" | "warning" | "critical" | "muted";

const statusMap: Record<StatusTone, { wrapper: string; dot: string }> = {
  healthy: {
    wrapper: "bg-[rgb(var(--success-3))] text-[rgb(var(--success-12))]",
    dot: "bg-[rgb(var(--success-9))]",
  },
  warning: {
    wrapper: "bg-[rgb(var(--warning-3))] text-[rgb(var(--warning-12))]",
    dot: "bg-[rgb(var(--warning-9))]",
  },
  critical: {
    wrapper: "bg-[rgb(var(--danger-3))] text-[rgb(var(--danger-12))]",
    dot: "bg-[rgb(var(--danger-9))]",
  },
  muted: {
    wrapper: "bg-[#f8f1e4] text-[#5c564c]",
    dot: "bg-[rgb(var(--neutral-9))]",
  },
};

export function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const classes = statusMap[tone];

  return (
    <span className={cn("inline-flex max-w-full shrink-0 items-center gap-1.5 overflow-hidden rounded px-2 py-0.5 text-[11px] font-medium leading-5", classes.wrapper)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", classes.dot)} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
