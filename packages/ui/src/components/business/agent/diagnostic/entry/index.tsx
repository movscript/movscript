"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentDiagnosticEntry = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-diagnostic-entry", className)} {...props} />;
  }
);

AgentDiagnosticEntry.displayName = "AgentDiagnosticEntry";

export const AgentDiagnosticEntryHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-diagnostic-entry__header", className)} {...props} />;
  }
);

AgentDiagnosticEntryHeader.displayName = "AgentDiagnosticEntryHeader";

export const AgentDiagnosticEntryTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-diagnostic-entry__title", className)} {...props} />;
  }
);

AgentDiagnosticEntryTitle.displayName = "AgentDiagnosticEntryTitle";

export const AgentDiagnosticEntryMeta = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-diagnostic-entry__meta", className)} {...props} />;
  }
);

AgentDiagnosticEntryMeta.displayName = "AgentDiagnosticEntryMeta";
