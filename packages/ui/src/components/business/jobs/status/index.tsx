import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { StatusBadge, type StatusBadgeProps } from "../../../primitives/badge";

export interface JobStatusBadgeProps extends Omit<StatusBadgeProps, "children"> {
  icon?: ReactNode;
  children: ReactNode;
}

export function JobStatusBadge({
  icon,
  children,
  className,
  ...statusProps
}: JobStatusBadgeProps) {
  return (
    <StatusBadge {...statusProps} className={cn(icon && "jobs-status-badge--with-icon", className)}>
      {icon ?? null}
      {children}
    </StatusBadge>
  );
}

export function JobSpinIcon({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("job-spin-icon", className)} {...props}>
      {children}
    </span>
  );
}
