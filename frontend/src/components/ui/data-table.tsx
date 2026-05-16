import { cn } from "@/lib/cn";

export function DataTable({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse", className)} {...props} />;
}

export function DataThead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[#f8f1e4]", className)} {...props} />;
}

export function DataTh({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-black/[0.10] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#5c564c]",
        className
      )}
      {...props}
    />
  );
}

export function DataTd({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-black/[0.07] px-3 py-2 text-sm text-black", className)} {...props} />;
}
