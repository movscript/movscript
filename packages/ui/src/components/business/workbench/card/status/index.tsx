import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { StatusBadge, type StatusBadgeProps } from "../../../../primitives";

export interface WorkbenchStatusBadgeProps extends Omit<StatusBadgeProps, "children"> {
  label: ReactNode;
}

export function WorkbenchStatusBadge({
  label,
  className,
  ...statusProps
}: WorkbenchStatusBadgeProps) {
  return <StatusBadge {...statusProps} className={cn("ms-inline-badge--center ms-inline-badge--truncate workbench-status-badge", className)}>{label}</StatusBadge>;
}
