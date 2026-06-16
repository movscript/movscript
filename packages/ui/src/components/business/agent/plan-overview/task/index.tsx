"use client";

import * as React from "react";
import { StatusBadge, StatusDot, type StatusBadgeProps, type StatusDotProps } from "../../../../primitives/badge";
import { cn } from "../../../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../../../semantic";

export const AgentPlanOverviewList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-stack ms-agent-plan-overview-list", className)} {...props} />;
  }
);

AgentPlanOverviewList.displayName = "AgentPlanOverviewList";

export const AgentPlanOverviewTaskCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-plan-overview-task", className)} {...props} />;
  }
);

AgentPlanOverviewTaskCard.displayName = "AgentPlanOverviewTaskCard";

export const AgentPlanOverviewTaskStatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, ...props }, ref) => {
    return <StatusDot ref={ref} className={cn("ms-agent-plan-overview-task__dot", className)} {...props} />;
  }
);

AgentPlanOverviewTaskStatusDot.displayName = "AgentPlanOverviewTaskStatusDot";

export interface AgentPlanOverviewTaskStatusIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent: SemanticTone;
}

export const AgentPlanOverviewTaskStatusIcon = React.forwardRef<HTMLSpanElement, AgentPlanOverviewTaskStatusIconProps>(
  ({ intent, className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-inline-center ms-agent-plan-overview-task__status-icon", toneTextClass(intent), className)} {...props} />;
  }
);

AgentPlanOverviewTaskStatusIcon.displayName = "AgentPlanOverviewTaskStatusIcon";

export const AgentPlanOverviewTaskBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-task__body", className)} {...props} />;
  }
);

AgentPlanOverviewTaskBody.displayName = "AgentPlanOverviewTaskBody";

export const AgentPlanOverviewTaskHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-plan-overview-task__header", className)} {...props} />;
  }
);

AgentPlanOverviewTaskHeader.displayName = "AgentPlanOverviewTaskHeader";

export const AgentPlanOverviewTaskTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-text-truncate ms-type-tiny ms-agent-plan-overview-task__title", className)} {...props} />;
  }
);

AgentPlanOverviewTaskTitle.displayName = "AgentPlanOverviewTaskTitle";

export const AgentPlanOverviewTaskBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-type-tiny ms-agent-plan-overview-task__badge", className)} {...props} />;
  }
);

AgentPlanOverviewTaskBadge.displayName = "AgentPlanOverviewTaskBadge";

export const AgentPlanOverviewTaskMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-type-tiny ms-agent-plan-overview-task__meta", className)} {...props} />;
  }
);

AgentPlanOverviewTaskMeta.displayName = "AgentPlanOverviewTaskMeta";
