"use client";

import * as React from "react";
import { cn } from "../../../../../lib/cn";
import { AgentDataBlock } from "../../run";

export const AgentDiagnosticSummaryGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-diagnostic-summary-grid", className)} {...props} />;
  }
);

AgentDiagnosticSummaryGrid.displayName = "AgentDiagnosticSummaryGrid";

export function AgentDiagnosticSummaryItem({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <AgentDataBlock className={cn("ms-agent-diagnostic-summary-item", className)}>
      <div className="ms-type-tiny ms-agent-diagnostic-summary-item__label">{label}</div>
      <div className="ms-text-truncate ms-type-caption ms-agent-diagnostic-summary-item__value">{value}</div>
    </AgentDataBlock>
  );
}
