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
    <span className={cn("inline-flex items-center gap-2 rounded px-3 py-1 text-xs font-medium", classes.wrapper)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", classes.dot)} />
      {children}
    </span>
  );
}
