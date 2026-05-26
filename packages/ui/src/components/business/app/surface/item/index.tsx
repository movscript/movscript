import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";

export function AppSurfaceItem({
  children,
  asChild = false,
  density = "normal",
  variant = "card",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: "normal" | "compact";
  variant?: "card" | "overlay" | "muted";
}) {
  return (
    <Surface
      asChild={asChild}
      kind={variant === "overlay" ? "overlay" : "item"}
      density={density === "compact" ? "compact" : "normal"}
      emphasis={variant === "muted" ? "muted" : variant === "overlay" ? "raised" : "raised"}
      data-variant={variant}
      className={cn("app-surface-item", className)}
      {...props}
    >
      {children}
    </Surface>
  );
}
