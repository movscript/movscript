import * as React from "react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneSurfaceClass } from "../../../../semantic";
import { StatusBadge, type StatusBadgeProps } from "../../../primitives";
import type { IconComponent, ReviewDecision, ReviewTone } from "../types";

export function ReviewCallout({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  compact = false,
  className,
  ...props
}: {
  tone?: ReviewTone;
  icon?: IconComponent;
  title?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div {...props} className={cn("ms-review-callout", compact && "ms-review-callout--compact", toneSurfaceClass(tone), className)}>
      {(Icon || title) && (
        <div className="ms-surface__heading ms-review-callout__header">
          {Icon && <Icon size={14} className="ms-review-callout__icon" />}
          {title && <p className="ms-review-callout__title">{title}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function ReviewStat({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ReviewTone;
  children: ReactNode;
  className?: string;
}) {
  return <StatusBadge {...reviewStatusProps(tone)} className={cn("ms-inline-badge ms-inline-badge--center ms-review-stat", className)}>{children}</StatusBadge>;
}

export function ReviewDecisionBadge({
  decision,
  className,
}: {
  decision: ReviewDecision;
  className?: string;
}) {
  return (
    <StatusBadge {...reviewStatusProps(decision === "accepted" ? "success" : "danger")} className={cn("ms-inline-badge ms-review-decision-badge", className)}>
      {decision === "accepted" ? "已接受" : "已拒绝"}
    </StatusBadge>
  );
}

function reviewStatusProps(tone: ReviewTone): Pick<StatusBadgeProps, "intent" | "emphasis"> {
  return { intent: tone, emphasis: "soft" };
}
