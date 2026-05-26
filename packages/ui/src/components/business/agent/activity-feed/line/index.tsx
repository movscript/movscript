"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import type { AgentActivityKind } from "../types";

export interface AgentActivityLineItemProps extends React.HTMLAttributes<HTMLDivElement> {
  expandable?: boolean;
}

export const AgentActivityLineItem = React.forwardRef<HTMLDivElement, AgentActivityLineItemProps>(
  ({ className, expandable = false, ...props }, ref) => {
    return <div ref={ref} data-expandable={expandable ? "true" : undefined} className={cn("ms-agent-activity-line-item", className)} {...props} />;
  }
);

AgentActivityLineItem.displayName = "AgentActivityLineItem";

export const AgentActivityLineRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-line-row", className)} {...props} />;
  }
);

AgentActivityLineRow.displayName = "AgentActivityLineRow";

export interface AgentActivityKindLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: AgentActivityKind;
}

export const AgentActivityKindLabel = React.forwardRef<HTMLSpanElement, AgentActivityKindLabelProps>(
  ({ className, kind = "default", ...props }, ref) => {
    return <span ref={ref} data-kind={kind} className={cn("ms-agent-activity-kind-label", className)} {...props} />;
  }
);

AgentActivityKindLabel.displayName = "AgentActivityKindLabel";

export const AgentActivityLineText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-activity-line-text", className)} {...props} />;
  }
);

AgentActivityLineText.displayName = "AgentActivityLineText";

export const AgentActivityDuration = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-activity-duration", className)} {...props} />;
  }
);

AgentActivityDuration.displayName = "AgentActivityDuration";
