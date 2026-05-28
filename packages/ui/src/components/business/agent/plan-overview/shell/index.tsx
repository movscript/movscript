"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { StatusBadge, type StatusBadgeProps } from "../../../../primitives/badge";
import { cn } from "../../../../../lib/cn";

export const AgentPlanOverviewShell = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview", className)} {...props} />;
  }
);

AgentPlanOverviewShell.displayName = "AgentPlanOverviewShell";

export const AgentPlanOverviewHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview__header", className)} {...props} />;
  }
);

AgentPlanOverviewHeader.displayName = "AgentPlanOverviewHeader";

export const AgentPlanOverviewHeaderBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview__header-body", className)} {...props} />;
  }
);

AgentPlanOverviewHeaderBody.displayName = "AgentPlanOverviewHeaderBody";

export interface AgentPlanOverviewTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
}

export const AgentPlanOverviewTitle = React.forwardRef<HTMLDivElement, AgentPlanOverviewTitleProps>(
  ({ className, icon, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("ms-agent-plan-overview__title", className)} {...props}>
        {icon ? <span className="ms-agent-plan-overview__title-icon">{icon}</span> : null}
        <span className="ms-agent-plan-overview__title-text">{children}</span>
      </div>
    );
  }
);

AgentPlanOverviewTitle.displayName = "AgentPlanOverviewTitle";

export const AgentPlanOverviewStats = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview__stats", className)} {...props} />;
  }
);

AgentPlanOverviewStats.displayName = "AgentPlanOverviewStats";

export const AgentPlanOverviewDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-plan-overview__description", className)} {...props} />;
  }
);

AgentPlanOverviewDescription.displayName = "AgentPlanOverviewDescription";

export const AgentPlanOverviewStatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-agent-plan-overview__status", className)} {...props} />;
  }
);

AgentPlanOverviewStatusBadge.displayName = "AgentPlanOverviewStatusBadge";

export const AgentPlanOverviewActionBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview__actions", className)} {...props} />;
  }
);

AgentPlanOverviewActionBar.displayName = "AgentPlanOverviewActionBar";

export const AgentPlanOverviewActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", ...props }, ref) => {
    return <Button ref={ref} size={size} className={cn("ms-agent-plan-overview__action", className)} {...props} />;
  }
);

AgentPlanOverviewActionButton.displayName = "AgentPlanOverviewActionButton";

export const AgentPlanOverviewSettingsGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview__settings", className)} {...props} />;
  }
);

AgentPlanOverviewSettingsGrid.displayName = "AgentPlanOverviewSettingsGrid";

export interface AgentPlanOverviewProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function AgentPlanOverviewProgress({
  className,
  value,
  ...props
}: AgentPlanOverviewProgressProps) {
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("ms-agent-plan-overview-progress", className)} {...props}>
      <div className="ms-agent-plan-overview-progress__bar" style={{ width: `${Math.round(bounded * 100)}%` }} />
    </div>
  );
}
