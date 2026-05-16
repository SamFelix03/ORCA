import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[rgb(var(--primary-9))] text-[rgb(var(--contrast-primary-9))] hover:bg-[rgb(var(--primary-10))] border border-[rgb(var(--primary-9))]",
  secondary:
    "bg-[rgb(var(--primary-2))] text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--primary-3))] border border-[rgb(var(--primary-6))]",
  outline:
    "bg-transparent text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--neutral-2))] border border-[rgb(var(--neutral-6))]",
  ghost:
    "bg-transparent text-[rgb(var(--primary-12))] hover:bg-[rgb(var(--neutral-3))] border border-transparent",
  danger:
    "bg-[rgb(var(--danger-9))] text-[rgb(var(--contrast-danger-9))] hover:bg-[rgb(var(--danger-10))] border border-[rgb(var(--danger-9))]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  md: "h-10 rounded-xl px-3 text-sm",
  lg: "h-11 rounded-xl px-4 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
});
