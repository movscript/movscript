"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Surface } from "./surface";

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  rowClassName?: string;
  copyClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  detailClassName?: string;
  iconClassName?: string;
}

export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      label,
      value,
      detail,
      icon,
      className,
      rowClassName,
      copyClassName,
      labelClassName,
      valueClassName,
      detailClassName,
      iconClassName,
      ...props
    },
    ref,
  ) => (
    <Surface ref={ref} kind="metric" density="normal" emphasis="plain" className={cn("ms-stat-card", className)} {...props}>
      <div className={cn("ms-stat-card__row", rowClassName)}>
        <div className={cn("ms-stat-card__copy", copyClassName)}>
          <p className={cn("ms-stat-card__label", labelClassName)}>{label}</p>
          <p className={cn("ms-tabular-nums ms-stat-card__value", valueClassName)}>{value}</p>
        </div>
        {icon ? <span className={cn("ms-center ms-stat-card__icon", iconClassName)}>{icon}</span> : null}
      </div>
      {detail ? <p className={cn("ms-stat-card__detail", detailClassName)}>{detail}</p> : null}
    </Surface>
  ),
);

MetricCard.displayName = "MetricCard";
