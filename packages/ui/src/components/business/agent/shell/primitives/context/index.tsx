"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";
import type { AgentSurfaceTone } from "../../../types";

export const AgentContextPanel = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <aside ref={ref} className={cn("ms-agent-context", className)} {...props} />;
  }
);

AgentContextPanel.displayName = "AgentContextPanel";

export const AgentMetric = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-stack ms-agent-field ms-agent-metric", className)} {...props} />;
  }
);

AgentMetric.displayName = "AgentMetric";

export const AgentWorkspace = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-stack ms-agent-workspace", className)} {...props} />;
  }
);

AgentWorkspace.displayName = "AgentWorkspace";

export const AgentContextBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-cluster ms-agent-cluster--wrap ms-agent-contextbar", className)} {...props} />;
  }
);

AgentContextBar.displayName = "AgentContextBar";

export interface AgentContextChipProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AgentSurfaceTone;
}

export const AgentContextChip = React.forwardRef<HTMLDivElement, AgentContextChipProps>(
  ({ className, tone = "neutral", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-tone={tone}
        className={cn("ms-agent-pill ms-agent-contextchip", `ms-agent-contextchip--${tone}`, className)}
        {...props}
      />
    );
  }
);

AgentContextChip.displayName = "AgentContextChip";
