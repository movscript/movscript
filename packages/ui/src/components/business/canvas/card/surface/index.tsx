import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../../lib/cn";
import { Frame } from "../../../../primitives";
import type { CanvasSurfaceDensity, CanvasSurfaceVariant } from "../types";

export function CanvasSurfaceItem({
  asChild = false,
  density = "normal",
  variant = "surface",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  density?: CanvasSurfaceDensity;
  variant?: CanvasSurfaceVariant;
  children: ReactNode;
}) {
  return (
    <Frame
      asChild={asChild}
      kind="item"
      density={density === "compact" ? "compact" : "normal"}
      emphasis={variant === "card" ? "raised" : variant === "muted" ? "muted" : "plain"}
      data-density={density}
      data-variant={variant}
      className={cn("canvas-surface-item", className)}
      {...props}
    >
      {children}
    </Frame>
  );
}
