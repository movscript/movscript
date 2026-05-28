"use client";

import * as React from "react";
import { Badge, type BadgeProps } from "../../../../primitives/badge";
import { cn } from "../../../../../lib/cn";

export const AgentPlanOverviewItemCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-item", className)} {...props} />;
  }
);

AgentPlanOverviewItemCard.displayName = "AgentPlanOverviewItemCard";

export const AgentPlanOverviewItemHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-item__header", className)} {...props} />;
  }
);

AgentPlanOverviewItemHeader.displayName = "AgentPlanOverviewItemHeader";

export const AgentPlanOverviewItemTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-plan-overview-item__title", className)} {...props} />;
  }
);

AgentPlanOverviewItemTitle.displayName = "AgentPlanOverviewItemTitle";

export const AgentPlanOverviewItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-item__actions", className)} {...props} />;
  }
);

AgentPlanOverviewItemActions.displayName = "AgentPlanOverviewItemActions";

export const AgentPlanOverviewMetaRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-meta-row", className)} {...props} />;
  }
);

AgentPlanOverviewMetaRow.displayName = "AgentPlanOverviewMetaRow";

export const AgentPlanOverviewMetaText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-plan-overview-meta-text", className)} {...props} />;
  }
);

AgentPlanOverviewMetaText.displayName = "AgentPlanOverviewMetaText";

export const AgentPlanOverviewBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("ms-agent-plan-overview-badge", className)} {...props} />;
  }
);

AgentPlanOverviewBadge.displayName = "AgentPlanOverviewBadge";

export const AgentPlanOverviewInlineActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-inline-actions", className)} {...props} />;
  }
);

AgentPlanOverviewInlineActions.displayName = "AgentPlanOverviewInlineActions";
