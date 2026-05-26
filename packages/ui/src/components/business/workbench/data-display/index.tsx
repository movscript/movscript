import type { ReactNode } from "react";
import { type SemanticTone, toneTextClass } from "../../../../semantic";
import { cn } from "../../../../lib/cn";
import { EmptyState, KeyValue, MetricCard } from "../../../primitives";
import type { WorkbenchIconComponent } from "../types";

export function WorkbenchMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  compact = false,
  className,
}: {
  icon?: WorkbenchIconComponent;
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
      icon={Icon ? <Icon size={compact ? 14 : 16} className={toneTextClass(tone)} /> : undefined}
      className={cn("workbench-metric", compact && "workbench-metric--compact", className)}
      rowClassName="workbench-metric__row"
      copyClassName="workbench-metric__copy"
      labelClassName="workbench-metric__label"
      valueClassName="workbench-metric__value"
      detailClassName="workbench-metric__detail"
      iconClassName="workbench-metric__icon"
    />
  );
}

export function WorkbenchKeyValue({
  label,
  value,
  strong,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <KeyValue
      label={label}
      value={value || "无"}
      className={cn("workbench-key-value", className)}
      labelClassName="workbench-key-value__label"
      valueClassName={cn("workbench-key-value__value", strong && "workbench-key-value__value--strong")}
    />
  );
}

export function WorkbenchEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: WorkbenchIconComponent;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <EmptyState
      data-border="dashed"
      icon={Icon ? <Icon size={compact ? 16 : 22} /> : undefined}
      title={title}
      description={description}
      action={action}
      className={cn("workbench-empty-state", compact && "workbench-empty-state--compact", className)}
      iconClassName="workbench-empty-state__icon"
      titleClassName="workbench-empty-state__title"
      descriptionClassName="workbench-empty-state__description"
      actionClassName="workbench-empty-state__action"
    />
  );
}
