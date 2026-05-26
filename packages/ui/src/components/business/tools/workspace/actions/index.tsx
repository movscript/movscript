import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { AppSurfaceItem } from "../../../app";

export function ToolActionBar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppSurfaceItem variant="muted" className={cn("tool-action-bar", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}
