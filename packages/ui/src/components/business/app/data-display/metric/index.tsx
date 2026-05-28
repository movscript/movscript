import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../../../semantic";
import { MetricCard } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";

export function AppMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  compact = false,
  className,
}: {
  icon?: IconComponent;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: SemanticTone;
  compact?: boolean;
  className?: string;
}) {
  return (
    <MetricCard
      label={label}
      value={value}
      detail={detail}
      icon={Icon ? <Icon size={compact ? 15 : 18} className={toneTextClass(tone)} /> : undefined}
      className={cn("app-metric-card", compact && "app-metric-card--compact", className)}
      rowClassName="app-metric-card__row"
      copyClassName="app-metric-card__copy"
      labelClassName="app-metric-card__label"
      valueClassName="app-metric-card__value"
      detailClassName="app-metric-card__detail"
      iconClassName="app-metric-card__icon"
    />
  );
}
