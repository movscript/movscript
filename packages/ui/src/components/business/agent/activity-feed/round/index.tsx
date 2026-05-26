"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";

export const AgentActivityRound = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <section ref={ref} className={cn("ms-agent-activity-round", className)} {...props} />;
  }
);

AgentActivityRound.displayName = "AgentActivityRound";

export function AgentActivityRoundHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-agent-activity-round__header", className)} {...props}>
      <span className="ms-agent-activity-round__rule" aria-hidden="true" />
      <span className="ms-agent-activity-round__label">{children}</span>
    </div>
  );
}

export const AgentActivityRoundItems = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-round__items", className)} {...props} />;
  }
);

AgentActivityRoundItems.displayName = "AgentActivityRoundItems";

export const AgentActivityRoundEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-round__empty", className)} {...props} />;
  }
);

AgentActivityRoundEmpty.displayName = "AgentActivityRoundEmpty";
