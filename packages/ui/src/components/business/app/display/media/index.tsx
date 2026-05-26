import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export function AppMediaFrame({
  children,
  variant = "thumb",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "thumb" | "stage" | "stage-dark" | "placeholder" | "panel" | "fill";
}) {
  return (
    <div data-variant={variant} className={cn("app-media-frame", className)} {...props}>
      {children}
    </div>
  );
}
