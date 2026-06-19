"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";
import type { AgentActivityKind } from "../types";

export const AgentActivityCardItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-card-item", className)} {...props} />;
  }
);

AgentActivityCardItem.displayName = "AgentActivityCardItem";

export interface AgentActivityFrameProps extends AgentSurfaceBlockProps {
  kind?: AgentActivityKind;
  expandable?: boolean;
}

export const AgentActivityFrame = React.forwardRef<HTMLElement, AgentActivityFrameProps>(
  ({ className, kind = "default", expandable = false, variant = "subtle", ...props }, ref) => {
    return (
      <AgentSurfaceBlock
        ref={ref}
        variant={variant}
        data-kind={kind}
        data-expandable={expandable ? "true" : undefined}
        className={cn("ms-agent-activity-frame", className)}
        {...props}
      />
    );
  }
);

AgentActivityFrame.displayName = "AgentActivityFrame";

export const AgentActivityFrameHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-activity-frame__header", className)} {...props} />;
  }
);

AgentActivityFrameHeader.displayName = "AgentActivityFrameHeader";

export const AgentActivityFrameTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-text-truncate ms-type-caption ms-agent-activity-frame__title", className)} {...props} />;
  }
);

AgentActivityFrameTitle.displayName = "AgentActivityFrameTitle";

export const AgentActivityFrameLines = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-frame__lines", className)} {...props} />;
  }
);

AgentActivityFrameLines.displayName = "AgentActivityFrameLines";

export const AgentActivityFrameLine = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-type-caption ms-agent-activity-frame__line", className)} {...props} />;
  }
);

AgentActivityFrameLine.displayName = "AgentActivityFrameLine";
