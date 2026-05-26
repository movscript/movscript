import type { HTMLAttributes } from "react";

import type { SemanticTone } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";

export function AppIconFrame({
  children,
  className,
  size = "md",
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  size?: "sm" | "md" | "lg";
  tone?: SemanticTone;
}) {
  return (
    <span data-size={size} data-tone={tone} className={cn("ms-center app-icon-frame", className)} {...props}>
      {children}
    </span>
  );
}
