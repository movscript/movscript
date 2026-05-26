"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";

export interface AgentRunFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  value?: React.ReactNode;
}

export const AgentRunField = React.forwardRef<HTMLDivElement, AgentRunFieldProps>(
  ({ className, label, value, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("ms-agent-stack ms-agent-field ms-agent-run-field", className)} {...props}>
        {label ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-run-field__label">{label}</span> : null}
        {value ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-run-field__value">{value}</span> : null}
        {children}
      </div>
    );
  }
);

AgentRunField.displayName = "AgentRunField";
