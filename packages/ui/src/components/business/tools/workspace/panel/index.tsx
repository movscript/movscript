import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface } from "../../../../primitives";

export function ToolPanel({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <Surface as="section" kind="panel" density="normal" emphasis="raised" className={cn("tool-panel", className)} {...props}>
      {children}
    </Surface>
  );
}

export function ToolPanelSection({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("tool-panel__section", className)} {...props}>
      {children}
    </div>
  );
}

export function ToolPanelHeader({ title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { title: ReactNode }) {
  return (
    <div className={cn("tool-panel__header", className)} {...props}>
      <p className="tool-panel__title">{title}</p>
      {children}
    </div>
  );
}
