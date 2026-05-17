import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/cn";

export function Icon({
  icon,
  size = 16,
  className,
}: {
  icon: IconSvgElement;
  size?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.8}
      color="currentColor"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    />
  );
}
