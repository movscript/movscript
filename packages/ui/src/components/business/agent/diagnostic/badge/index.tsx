"use client";

import * as React from "react";
import { Badge, StatusBadge, type BadgeProps, type StatusBadgeProps } from "../../../../primitives/badge";
import { cn } from "../../../../../lib/cn";

export const AgentDiagnosticBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "outline", ...props }, ref) => {
    return <Badge ref={ref} variant={variant} className={cn("ms-agent-diagnostic-badge", className)} {...props} />;
  }
);

AgentDiagnosticBadge.displayName = "AgentDiagnosticBadge";

export const AgentDiagnosticStatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-agent-diagnostic-badge", className)} {...props} />;
  }
);

AgentDiagnosticStatusBadge.displayName = "AgentDiagnosticStatusBadge";
