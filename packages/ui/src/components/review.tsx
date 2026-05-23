import type { ComponentType, HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";
import { semanticToneClass, type SemanticTone } from "./semantic";

export type ReviewTone = SemanticTone;
export type ChangeAction = "create" | "update" | "delete";
export type ReviewDecision = "accepted" | "rejected";

type IconComponent = ComponentType<{ size?: string | number; className?: string }>;

export function changeActionTone(action?: ChangeAction): SemanticTone {
  if (action === "delete") return "danger";
  if (action === "update") return "warning";
  return "success";
}

export function changeActionRowClass(action?: ChangeAction, className?: string) {
  return cn("ms-change-action-row", `ms-change-action-row--${changeActionTone(action)}`, className);
}

export function ChangeActionBadge({
  action,
  compact = false,
  className,
}: {
  action?: ChangeAction;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ms-change-action-badge",
        compact && "ms-change-action-badge--compact",
        semanticToneClass(changeActionTone(action), "icon"),
        className,
      )}
    >
      {action === "delete" ? "-" : action === "update" ? "~" : "+"}
    </span>
  );
}

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
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn("ms-review-callout", compact && "ms-review-callout--compact", semanticToneClass(tone, "surface"), className)}>
      {(Icon || title) && (
        <div className="ms-review-callout__header">
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
  return <span className={cn("ms-review-stat", semanticToneClass(tone, "badge"), className)}>{children}</span>;
}

export function ReviewDecisionBadge({
  decision,
  className,
}: {
  decision: ReviewDecision;
  className?: string;
}) {
  return (
    <span className={cn("ms-review-decision-badge", semanticToneClass(decision === "accepted" ? "success" : "danger", "badge"), className)}>
      {decision === "accepted" ? "已接受" : "已拒绝"}
    </span>
  );
}
