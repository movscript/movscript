import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../../lib/cn";
import type { CanvasPortHandleRenderer, CanvasPortTone } from "../types";

export function CanvasPortDot({
  side,
  tone = "neutral",
  label,
  compact,
  handleId,
  handleType,
  renderPortHandle,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  side: "left" | "right";
  tone?: CanvasPortTone;
  label?: string;
  compact?: boolean;
  handleId?: string;
  handleType?: "target" | "source";
  renderPortHandle?: CanvasPortHandleRenderer;
}) {
  const resolvedLabel = label ?? props.title?.toString() ?? (side === "left" ? "in" : "out");
  return (
    <span
      data-side={side}
      data-tone={tone}
      data-compact={compact ? "true" : undefined}
      className={cn("canvas-port-dot", className)}
      {...props}
    >
      {handleId && handleType && renderPortHandle ? renderPortHandle({ id: handleId, type: handleType, side, label: resolvedLabel }) : null}
      {children}
    </span>
  );
}
