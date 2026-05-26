"use client";

import * as React from "react";
import { Badge, type BadgeProps } from "../../../../primitives/badge";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { cn } from "../../../../../lib/cn";

export const AgentGeneratedViewerSidePanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-viewer-panel", className)} {...props} />;
  }
);

AgentGeneratedViewerSidePanel.displayName = "AgentGeneratedViewerSidePanel";

export const AgentGeneratedViewerSideHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-viewer-panel__header", className)} {...props} />;
  }
);

AgentGeneratedViewerSideHeader.displayName = "AgentGeneratedViewerSideHeader";

export const AgentGeneratedViewerSideActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-viewer-panel__actions", className)} {...props} />;
  }
);

AgentGeneratedViewerSideActions.displayName = "AgentGeneratedViewerSideActions";

export const AgentGeneratedViewerActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", ...props }, ref) => {
    return <Button ref={ref} size={size} className={cn("ms-agent-generated-viewer-panel__action", className)} {...props} />;
  }
);

AgentGeneratedViewerActionButton.displayName = "AgentGeneratedViewerActionButton";

export const AgentGeneratedViewerBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => {
    return <Badge ref={ref} className={cn("ms-agent-generated-viewer-panel__badge", className)} {...props} />;
  }
);

AgentGeneratedViewerBadge.displayName = "AgentGeneratedViewerBadge";
