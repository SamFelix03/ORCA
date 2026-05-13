import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[rgb(var(--primary-9))] text-[rgb(var(--contrast-primary-9))] hover:bg-[rgb(var(--primary-10))] border border-[rgb(var(--primary-9))]",
  secondary:
    "bg-[rgb(var(--primary-2))] text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--primary-3))] border border-[rgb(var(--primary-6))]",
  ghost:
    "bg-transparent text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--neutral-3))] border border-transparent",
  danger:
    "bg-[rgb(var(--danger-9))] text-[rgb(var(--contrast-danger-9))] hover:bg-[rgb(var(--danger-10))] border border-[rgb(var(--danger-9))]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
});
