import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[rgb(var(--neutral-3))] text-[rgb(var(--neutral-12))] border-[rgb(var(--neutral-6))]",
  success: "bg-[rgb(var(--success-4))] text-[rgb(var(--success-12))] border-[rgb(var(--success-7))]",
  warning: "bg-[rgb(var(--warning-4))] text-[rgb(var(--warning-12))] border-[rgb(var(--warning-7))]",
  danger: "bg-[rgb(var(--danger-4))] text-[rgb(var(--danger-12))] border-[rgb(var(--danger-7))]",
  info: "bg-[rgb(var(--primary-3))] text-[rgb(var(--primary-12))] border-[rgb(var(--primary-6))]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClasses[tone])}>
      {children}
    </span>
  );
}
