"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock } from "../../surface-block";

export const AgentPlanOverviewDisclosure = React.forwardRef<HTMLDetailsElement, React.DetailsHTMLAttributes<HTMLDetailsElement>>(
  ({ className, ...props }, ref) => {
    return (
      <AgentSurfaceBlock asChild variant="subtle" className={cn("ms-agent-plan-overview-disclosure", className)}>
        <details ref={ref} {...props} />
      </AgentSurfaceBlock>
    );
  }
);

AgentPlanOverviewDisclosure.displayName = "AgentPlanOverviewDisclosure";

export const AgentPlanOverviewDisclosureSummary = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <summary ref={ref} className={cn("ms-agent-plan-overview-disclosure__summary", className)} {...props} />;
  }
);

AgentPlanOverviewDisclosureSummary.displayName = "AgentPlanOverviewDisclosureSummary";

export const AgentPlanOverviewDisclosureBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-disclosure__body", className)} {...props} />;
  }
);

AgentPlanOverviewDisclosureBody.displayName = "AgentPlanOverviewDisclosureBody";

export const AgentPlanOverviewFilterRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-plan-overview-filter-row", className)} {...props} />;
  }
);

AgentPlanOverviewFilterRow.displayName = "AgentPlanOverviewFilterRow";
