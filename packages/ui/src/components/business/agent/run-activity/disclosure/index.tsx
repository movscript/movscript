"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock } from "../../surface-block";

export interface AgentRunActivityDisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  status?: React.ReactNode;
  summary?: React.ReactNode;
}

export function AgentRunActivityDisclosure({
  title,
  icon,
  action,
  status,
  summary,
  children,
  className,
  ...props
}: AgentRunActivityDisclosureProps) {
  return (
    <AgentSurfaceBlock asChild className={cn("ms-agent-run-activity", className)}>
      <details {...props}>
        <summary className="ms-agent-run-activity__summary">
          <AgentRunActivityTitle icon={icon}>{title}</AgentRunActivityTitle>
          <AgentRunActivityMeta>
            {action}
            {status}
            {summary ? <AgentRunActivitySummaryText>{summary}</AgentRunActivitySummaryText> : null}
          </AgentRunActivityMeta>
        </summary>
        <div className="ms-agent-run-activity__content">{children}</div>
      </details>
    </AgentSurfaceBlock>
  );
}

export interface AgentRunActivityTitleProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: React.ReactNode;
}

export const AgentRunActivityTitle = React.forwardRef<HTMLSpanElement, AgentRunActivityTitleProps>(
  ({ className, icon, children, ...props }, ref) => {
    return (
      <span ref={ref} className={cn("ms-agent-run-activity__title", className)} {...props}>
        {icon ? <span className="ms-agent-run-activity__icon">{icon}</span> : null}
        <span className="ms-agent-run-activity__title-text">{children}</span>
      </span>
    );
  }
);

AgentRunActivityTitle.displayName = "AgentRunActivityTitle";

export const AgentRunActivityMeta = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-run-activity__meta", className)} {...props} />;
  }
);

AgentRunActivityMeta.displayName = "AgentRunActivityMeta";

export const AgentRunActivitySummaryText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-run-activity__summary-text", className)} {...props} />;
  }
);

AgentRunActivitySummaryText.displayName = "AgentRunActivitySummaryText";

export function AgentRunActivityEmpty({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <AgentSurfaceBlock variant="subtle" className={cn("ms-agent-run-activity-empty", className)} {...props} />;
}
