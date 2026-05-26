import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";

export function DetailPill({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("ms-inline-badge ms-inline-badge--truncate detail-pill", className)} {...props}>
      <span className="detail-pill__text">{children}</span>
    </span>
  );
}

export function DetailMetric({
  label,
  value,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <span className={cn("ms-inline-badge detail-metric", className)} {...props}>
      <span className="detail-metric__label">{label}</span>
      <span className="detail-metric__value">{value}</span>
    </span>
  );
}
