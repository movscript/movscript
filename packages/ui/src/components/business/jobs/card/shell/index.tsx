import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { AppPanel } from "../../../app";

export function JobCardShell({
  selected = false,
  layout = "list",
  children,
  className,
  bodyClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  selected?: boolean;
  layout?: "list" | "grid";
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      className={cn("job-card", selected && "job-card--selected", className)}
      bodyClassName={cn("job-card__body", bodyClassName)}
      data-layout={layout}
      {...props}
    >
      {children}
    </AppPanel>
  );
}
