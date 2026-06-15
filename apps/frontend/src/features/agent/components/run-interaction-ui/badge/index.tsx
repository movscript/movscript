"use client";

import * as React from "react";

import { Badge, type BadgeProps } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";

export const AgentRunInteractionApprovalBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("agent-run-interaction-badge", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBadge.displayName = "AgentRunInteractionApprovalBadge";

export const AgentRunInteractionApprovalBadgeLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("agent-run-interaction-badge-label", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBadgeLabel.displayName = "AgentRunInteractionApprovalBadgeLabel";
