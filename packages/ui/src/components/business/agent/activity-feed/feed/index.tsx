"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";

export const AgentActivityFeedRoot = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-type-label ms-agent-activity-feed", className)} {...props} />;
  }
);

AgentActivityFeedRoot.displayName = "AgentActivityFeedRoot";

export const AgentActivityTotals = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-type-tiny ms-agent-activity-feed__totals", className)} {...props} />;
  }
);

AgentActivityTotals.displayName = "AgentActivityTotals";

export function AgentActivityStatusLine({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-action-row ms-agent-activity-status-line", className)} {...props}>
      <div className="ms-action-row ms-type-caption ms-agent-activity-status-line__content">
        <span className="ms-agent-activity-status-line__dot" aria-hidden="true" />
        <span className="ms-text-truncate ms-agent-activity-status-line__label">{children}</span>
      </div>
    </div>
  );
}
