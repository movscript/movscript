"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { cn } from "../../../../../lib/cn";

export const AgentRunActivityBubble = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-activity-bubble", className)} {...props} />;
  }
);

AgentRunActivityBubble.displayName = "AgentRunActivityBubble";

export const AgentRunActivityDetailButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", variant = "ghost", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-run-activity-detail-button", className)} {...props} />;
  }
);

AgentRunActivityDetailButton.displayName = "AgentRunActivityDetailButton";
