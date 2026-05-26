"use client";

import * as React from "react";

import { AsChildSlot } from "../../../../../lib/asChild";
import { cn } from "../../../../../lib/cn";

export interface AgentDataBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const AgentDataBlock = React.forwardRef<HTMLDivElement, AgentDataBlockProps>(
  ({ asChild = false, className, ...props }, ref) => {
    if (asChild) {
      return <AsChildSlot ref={ref} className={cn("ms-agent-field ms-agent-data-block", className)} {...props} />;
    }
    return <div ref={ref} className={cn("ms-agent-field ms-agent-data-block", className)} {...props} />;
  }
);

AgentDataBlock.displayName = "AgentDataBlock";
