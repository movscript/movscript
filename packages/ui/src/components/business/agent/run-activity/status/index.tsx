"use client";

import * as React from "react";
import { Badge, StatusBadge, StatusDot, type BadgeProps, type StatusBadgeProps } from "../../../../primitives/badge";
import { cn } from "../../../../../lib/cn";

export const AgentRunActivityStatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-type-tiny ms-agent-run-activity-status", className)} {...props} />;
  }
);

AgentRunActivityStatusBadge.displayName = "AgentRunActivityStatusBadge";

export const AgentRunActivityStatusDot = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof StatusDot>>(
  ({ className, ...props }, ref) => {
    return <StatusDot ref={ref} className={cn("ms-agent-run-activity-dot", className)} {...props} />;
  }
);

AgentRunActivityStatusDot.displayName = "AgentRunActivityStatusDot";

export const AgentRunActivityChatBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("ms-type-tiny ms-agent-run-activity-chat-badge", className)} {...props} />;
  }
);

AgentRunActivityChatBadge.displayName = "AgentRunActivityChatBadge";
