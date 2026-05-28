"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";

export const AgentWorkflowApprovalPreviewStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-workflow-approval-preview-stack", className)} {...props} />;
  }
);

AgentWorkflowApprovalPreviewStack.displayName = "AgentWorkflowApprovalPreviewStack";

export function AgentWorkflowApprovalSideEffect({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-agent-workflow-approval-side-effect", className)} {...props} />;
}
