"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentDiagnosticToolItem = React.forwardRef<HTMLElement, AgentSurfaceBlockProps>(
  ({ className, variant = "card", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-diagnostic-tool", className)} {...props} />;
  }
);

AgentDiagnosticToolItem.displayName = "AgentDiagnosticToolItem";

export const AgentDiagnosticToolHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-diagnostic-tool__header", className)} {...props} />;
  }
);

AgentDiagnosticToolHeader.displayName = "AgentDiagnosticToolHeader";

export const AgentDiagnosticToolName = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-text-truncate ms-type-caption ms-agent-diagnostic-tool__name", className)} {...props} />;
  }
);

AgentDiagnosticToolName.displayName = "AgentDiagnosticToolName";

export const AgentDiagnosticToolText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-type-tiny ms-agent-diagnostic-tool__text", className)} {...props} />;
  }
);

AgentDiagnosticToolText.displayName = "AgentDiagnosticToolText";
