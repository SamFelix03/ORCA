import { cn } from "@/lib/cn";

export function DataTable({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse", className)} {...props} />;
}

export function DataThead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[rgb(var(--neutral-2))]", className)} {...props} />;
}

export function DataTh({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[rgb(var(--neutral-5))] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[rgb(var(--neutral-10))]",
        className
      )}
      {...props}
    />
  );
}

export function DataTd({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-[rgb(var(--neutral-4))] px-3 py-2 text-sm text-[rgb(var(--primary-12))]", className)} {...props} />;
}
