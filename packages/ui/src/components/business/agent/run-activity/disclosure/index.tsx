"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";

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
    <details className={cn("ms-agent-run-activity", className)} {...props}>
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
  );
}

interface AgentRunActivityTitleProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: React.ReactNode;
}

const AgentRunActivityTitle = React.forwardRef<HTMLSpanElement, AgentRunActivityTitleProps>(
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

const AgentRunActivityMeta = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-run-activity__meta", className)} {...props} />;
  }
);

AgentRunActivityMeta.displayName = "AgentRunActivityMeta";

const AgentRunActivitySummaryText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-run-activity__summary-text", className)} {...props} />;
  }
);

AgentRunActivitySummaryText.displayName = "AgentRunActivitySummaryText";

export function AgentRunActivityEmpty({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ms-agent-run-activity-empty", className)} {...props} />;
}
