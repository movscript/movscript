"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentWorkflowApprovalPreviewStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-preview-stack", className)} {...props} />;
  }
);

AgentWorkflowApprovalPreviewStack.displayName = "AgentWorkflowApprovalPreviewStack";

export function AgentWorkflowApprovalSideEffect({
  className,
  ...props
}: AgentSurfaceBlockProps) {
  return <AgentSurfaceBlock variant="subtle" className={cn("ms-agent-workflow-approval-side-effect", className)} {...props} />;
}
