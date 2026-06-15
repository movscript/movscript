"use client";

import * as React from "react";

import { cn } from "@/shared/ui/cn";

export const AgentRunInteractionApprovalPreviewStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-interaction-preview-stack", className)} {...props} />;
  }
);

AgentRunInteractionApprovalPreviewStack.displayName = "AgentRunInteractionApprovalPreviewStack";

export function AgentRunInteractionApprovalSideEffect({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-agent-run-interaction-side-effect", className)} {...props} />;
}
