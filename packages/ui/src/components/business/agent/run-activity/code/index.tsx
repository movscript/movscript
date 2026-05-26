"use client";

import * as React from "react";
import { AppCodeBlock } from "../../../app";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock } from "../../surface-block";

export interface AgentRunActivityCodeDisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: React.ReactNode;
}

export function AgentRunActivityCodeDisclosure({
  title,
  children,
  className,
  ...props
}: AgentRunActivityCodeDisclosureProps) {
  return (
    <AgentSurfaceBlock asChild variant="subtle" className={cn("ms-agent-run-activity-code", className)}>
      <details {...props}>
        <summary className="ms-agent-run-activity-code__summary">{title}</summary>
        <AppCodeBlock className="ms-agent-run-activity-code__content">{children}</AppCodeBlock>
      </details>
    </AgentSurfaceBlock>
  );
}
