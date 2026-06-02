"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, type BadgeProps } from "../../../../primitives/badge";

export const AgentRunInteractionApprovalBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("ms-agent-run-interaction-badge", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBadge.displayName = "AgentRunInteractionApprovalBadge";

export const AgentRunInteractionApprovalBadgeLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-run-interaction-badge__label", className)} {...props} />;
  }
);

AgentRunInteractionApprovalBadgeLabel.displayName = "AgentRunInteractionApprovalBadgeLabel";
