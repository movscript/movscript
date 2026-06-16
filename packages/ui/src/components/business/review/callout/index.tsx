import * as React from "react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneSurfaceClass } from "../../../../semantic";
import { Frame, FrameHeading, StatusBadge, type StatusBadgeProps } from "../../../primitives";
import type { IconComponent, ReviewTone } from "../types";

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
    <Frame {...props} kind="panel" emphasis="plain" className={cn("ms-review-callout", compact && "ms-review-callout--compact", toneSurfaceClass(tone), className)}>
      {(Icon || title) && (
        <FrameHeading className="ms-action-row ms-surface__heading ms-review-callout__header">
          {Icon && <Icon size={14} className="ms-review-callout__icon" />}
          {title && <p className="ms-type-label ms-review-callout__title">{title}</p>}
        </FrameHeading>
      )}
      {children}
    </Frame>
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
  return <StatusBadge {...reviewStatusProps(tone)} className={cn("ms-inline-badge ms-inline-badge--center ms-type-tiny ms-review-stat", className)}>{children}</StatusBadge>;
}

function reviewStatusProps(tone: ReviewTone): Pick<StatusBadgeProps, "intent" | "emphasis"> {
  return { intent: tone, emphasis: "soft" };
}
