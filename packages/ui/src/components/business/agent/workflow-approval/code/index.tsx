"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AppCodeBlock } from "../../../app";
import { AgentDataBlock } from "../../run";

export function AgentWorkflowApprovalCodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AgentDataBlock className={cn("ms-agent-workflow-approval-code", className)} {...props}>
      <AppCodeBlock>{children}</AppCodeBlock>
    </AgentDataBlock>
  );
}
