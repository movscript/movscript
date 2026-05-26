"use client";

import * as React from "react";
import { AppCodeBlock } from "../../../app";
import { cn } from "../../../../../lib/cn";
import { AgentDataBlock } from "../../run";
import { AgentSurfaceBlock } from "../../surface-block";

export interface AgentActivityCodePanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
}

export function AgentActivityCodePanel({
  title,
  children,
  className,
  ...props
}: AgentActivityCodePanelProps) {
  return (
    <AgentSurfaceBlock className={cn("ms-agent-activity-code-panel", className)} {...props}>
      <div className="ms-agent-activity-code-panel__header">{title}</div>
      <AgentDataBlock className="ms-agent-activity-code-panel__body">
        <AppCodeBlock>{children}</AppCodeBlock>
      </AgentDataBlock>
    </AgentSurfaceBlock>
  );
}
