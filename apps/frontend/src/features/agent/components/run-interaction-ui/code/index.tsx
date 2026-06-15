"use client";

import * as React from "react";

import { AppCodeBlock } from "@movscript/ui/business/app";
import { cn } from "@/shared/ui/cn";

export function AgentRunInteractionApprovalCodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-agent-field ms-agent-data-block ms-agent-run-interaction-code", className)} {...props}>
      <AppCodeBlock>{children}</AppCodeBlock>
    </div>
  );
}
