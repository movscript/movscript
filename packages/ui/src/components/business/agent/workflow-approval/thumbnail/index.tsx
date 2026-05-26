"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentWorkflowApprovalThumbnail = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-workflow-approval-thumb", className)} {...props} />;
  }
);

AgentWorkflowApprovalThumbnail.displayName = "AgentWorkflowApprovalThumbnail";

export const AgentWorkflowApprovalThumbnailFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-thumb__fallback", className)} {...props} />;
  }
);

AgentWorkflowApprovalThumbnailFallback.displayName = "AgentWorkflowApprovalThumbnailFallback";
