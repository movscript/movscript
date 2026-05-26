import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";

export function CanvasCardShell({
  selected,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <Surface
      kind="card"
      density="normal"
      emphasis="raised"
      interaction={selected ? "selected" : "none"}
      data-selected={selected ? "true" : undefined}
      className={cn("canvas-card-shell", className)}
      {...props}
    >
      {children}
    </Surface>
  );
}
