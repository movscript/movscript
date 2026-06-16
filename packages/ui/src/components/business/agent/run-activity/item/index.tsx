"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";

export const AgentRunActivityItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-activity-item", className)} {...props} />;
  }
);

AgentRunActivityItem.displayName = "AgentRunActivityItem";

export const AgentRunActivityItemRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-run-activity-item__row", className)} {...props} />;
  }
);

AgentRunActivityItemRow.displayName = "AgentRunActivityItemRow";

export const AgentRunActivityItemBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-activity-item__body", className)} {...props} />;
  }
);

AgentRunActivityItemBody.displayName = "AgentRunActivityItemBody";

export const AgentRunActivityItemHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-run-activity-item__header", className)} {...props} />;
  }
);

AgentRunActivityItemHeader.displayName = "AgentRunActivityItemHeader";

export const AgentRunActivityItemTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-text-truncate ms-type-caption ms-agent-run-activity-item__title", className)} {...props} />;
  }
);

AgentRunActivityItemTitle.displayName = "AgentRunActivityItemTitle";

export const AgentRunActivityItemMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-type-tiny ms-agent-run-activity-item__meta", className)} {...props} />;
  }
);

AgentRunActivityItemMeta.displayName = "AgentRunActivityItemMeta";

export interface AgentRunActivityItemSummaryProps extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: boolean;
}

export const AgentRunActivityItemSummary = React.forwardRef<HTMLParagraphElement, AgentRunActivityItemSummaryProps>(
  ({ className, error = false, ...props }, ref) => {
    return <p ref={ref} data-error={error ? "true" : undefined} className={cn("ms-type-caption ms-agent-run-activity-item__summary", className)} {...props} />;
  }
);

AgentRunActivityItemSummary.displayName = "AgentRunActivityItemSummary";
