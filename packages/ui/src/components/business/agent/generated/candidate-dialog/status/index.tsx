"use client";

import * as React from "react";
import { cn } from "../../../../../../lib/cn";

export interface AgentGeneratedCandidateStatusMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  tone?: "neutral" | "success" | "danger";
}

export const AgentGeneratedCandidateStatusMessage = React.forwardRef<HTMLParagraphElement, AgentGeneratedCandidateStatusMessageProps>(
  ({ className, tone = "neutral", ...props }, ref) => {
    return (
      <p
        ref={ref}
        data-tone={tone}
        className={cn("ms-agent-generated-candidate-status-message", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedCandidateStatusMessage.displayName = "AgentGeneratedCandidateStatusMessage";
