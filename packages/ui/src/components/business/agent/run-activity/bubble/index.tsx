"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentRunActivityBubble = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-run-activity-bubble", className)} {...props} />;
  }
);

AgentRunActivityBubble.displayName = "AgentRunActivityBubble";

export const AgentRunActivityBubbleFrame = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} className={cn("ms-agent-run-activity-bubble__frame", className)} {...props} />;
  }
);

AgentRunActivityBubbleFrame.displayName = "AgentRunActivityBubbleFrame";

export const AgentRunActivityBubbleButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", ...props }, ref) => {
    return <Button ref={ref} variant={variant} className={cn("ms-agent-run-activity-bubble__button", className)} {...props} />;
  }
);

AgentRunActivityBubbleButton.displayName = "AgentRunActivityBubbleButton";

export const AgentRunActivityDetailButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", variant = "ghost", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-run-activity-detail-button", className)} {...props} />;
  }
);

AgentRunActivityDetailButton.displayName = "AgentRunActivityDetailButton";
