"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";

export const AgentSuggestions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-cluster ms-agent-cluster--wrap ms-agent-suggestions", className)} {...props} />;
  }
);

AgentSuggestions.displayName = "AgentSuggestions";

export const AgentSuggestion = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => {
    return <button ref={ref} type={type} className={cn("ms-control ms-agent-pill ms-agent-suggestion", className)} {...props} />;
  }
);

AgentSuggestion.displayName = "AgentSuggestion";
