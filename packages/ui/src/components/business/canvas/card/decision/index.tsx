import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../../lib/cn";

export function CanvasDecisionMark({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "success" | "neutral" | "muted";
}) {
  return (
    <span data-tone={tone} className={cn("canvas-decision-mark", `canvas-decision-mark--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}
