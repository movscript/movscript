"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentRunInteractionApprovalThumbnail = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-run-interaction-thumb", className)} {...props} />;
  }
);

AgentRunInteractionApprovalThumbnail.displayName = "AgentRunInteractionApprovalThumbnail";

export const AgentRunInteractionApprovalThumbnailFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-interaction-thumb__fallback", className)} {...props} />;
  }
);

AgentRunInteractionApprovalThumbnailFallback.displayName = "AgentRunInteractionApprovalThumbnailFallback";
