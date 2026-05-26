import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import type { SemanticTone } from "../../../../../semantic";

export function CanvasToolFullState({
  tone = "neutral",
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: SemanticTone;
  icon?: ReactNode;
}) {
  return (
    <div data-tone={tone} className={cn("canvas-tool-full-state", className)} {...props}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
