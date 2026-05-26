import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { MetricCard } from "../../../../primitives";

export function AppDashboardMetric({
  label,
  value,
  detail,
  icon,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <MetricCard
      label={label}
      value={value}
      detail={detail}
      icon={icon}
      className={cn("app-dashboard-stat", className)}
      rowClassName="app-dashboard-stat__row"
      copyClassName="app-dashboard-stat__copy"
      labelClassName="app-dashboard-stat__label"
      valueClassName="app-dashboard-stat__value"
      detailClassName="app-dashboard-stat__detail"
      iconClassName="app-dashboard-stat__icon"
      {...props}
    />
  );
}
