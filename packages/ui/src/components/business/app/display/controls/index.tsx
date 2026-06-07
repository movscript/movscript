import * as React from "react";
import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export function AppControlGroup({
  children,
  layout = "wrap",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  layout?: "wrap" | "grid";
}) {
  return (
    <div data-layout={layout} className={cn("app-control-group", className)} {...props}>
      {children}
    </div>
  );
}
