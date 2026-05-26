"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import type { AgentStepState } from "../../types";

export interface AgentToolStepProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: AgentStepState;
}

export const AgentToolStep = React.forwardRef<HTMLDivElement, AgentToolStepProps>(
  ({ className, state = "pending", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-state={state}
        className={cn("ms-agent-stack ms-agent-field ms-agent-tool-step", `ms-agent-tool-step--${state}`, className)}
        {...props}
      />
    );
  }
);

AgentToolStep.displayName = "AgentToolStep";
