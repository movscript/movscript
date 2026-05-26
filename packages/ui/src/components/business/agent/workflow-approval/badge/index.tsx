"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, type BadgeProps } from "../../../../primitives/badge";

export const AgentWorkflowApprovalBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("ms-agent-workflow-approval-badge", className)} {...props} />;
  }
);

AgentWorkflowApprovalBadge.displayName = "AgentWorkflowApprovalBadge";

export const AgentWorkflowApprovalBadgeLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-workflow-approval-badge__label", className)} {...props} />;
  }
);

AgentWorkflowApprovalBadgeLabel.displayName = "AgentWorkflowApprovalBadgeLabel";
