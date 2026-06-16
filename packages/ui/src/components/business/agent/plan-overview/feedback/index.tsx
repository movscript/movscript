"use client";

import * as React from "react";
import { AppCodeBlock } from "../../../app";
import { cn } from "../../../../../lib/cn";

export interface AgentPlanOverviewCodeDisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: React.ReactNode;
}

export function AgentPlanOverviewCodeDisclosure({
  title,
  children,
  className,
  ...props
}: AgentPlanOverviewCodeDisclosureProps) {
  return (
    <details className={cn("ms-agent-plan-overview-code", className)} {...props}>
      <summary className="ms-type-tiny ms-agent-plan-overview-code__summary">{title}</summary>
      <AppCodeBlock className="ms-type-tiny ms-agent-plan-overview-code__content">{children}</AppCodeBlock>
    </details>
  );
}

export const AgentPlanOverviewNotice = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-type-tiny ms-agent-plan-overview-notice", className)} {...props} />;
  }
);

AgentPlanOverviewNotice.displayName = "AgentPlanOverviewNotice";

export const AgentPlanOverviewNoticeTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-text-truncate ms-agent-plan-overview-notice__title", className)} {...props} />;
  }
);

AgentPlanOverviewNoticeTitle.displayName = "AgentPlanOverviewNoticeTitle";

export const AgentPlanOverviewText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-type-tiny ms-agent-plan-overview-text", className)} {...props} />;
  }
);

AgentPlanOverviewText.displayName = "AgentPlanOverviewText";

export const AgentPlanOverviewWarningText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-type-tiny ms-agent-plan-overview-warning", className)} {...props} />;
  }
);

AgentPlanOverviewWarningText.displayName = "AgentPlanOverviewWarningText";

export const AgentPlanOverviewErrorText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-plan-overview-error", className)} {...props} />;
  }
);

AgentPlanOverviewErrorText.displayName = "AgentPlanOverviewErrorText";
