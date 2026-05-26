"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";

export const AgentInlineCode = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <code ref={ref} className={cn("ms-agent-inline-code", className)} {...props} />;
  }
);

AgentInlineCode.displayName = "AgentInlineCode";

export interface AgentMediaThumbProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md";
}

export const AgentMediaThumb = React.forwardRef<HTMLSpanElement, AgentMediaThumbProps>(
  ({ className, size = "sm", ...props }, ref) => {
    return <span ref={ref} data-size={size} className={cn("ms-agent-media-thumb", className)} {...props} />;
  }
);

AgentMediaThumb.displayName = "AgentMediaThumb";

export const AgentInlineResource = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-pill ms-agent-inline-resource", className)} {...props} />;
  }
);

AgentInlineResource.displayName = "AgentInlineResource";
