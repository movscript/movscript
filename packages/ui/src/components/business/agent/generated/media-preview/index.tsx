"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { cn } from "../../../../../lib/cn";

export type AgentGeneratedMediaPreviewSurface = "muted" | "dark";

export interface AgentGeneratedMediaPreviewProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: AgentGeneratedMediaPreviewSurface;
}

export const AgentGeneratedMediaPreview = React.forwardRef<HTMLDivElement, AgentGeneratedMediaPreviewProps>(
  ({ className, surface = "muted", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-surface={surface}
        className={cn("ms-agent-generated-media-preview", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedMediaPreview.displayName = "AgentGeneratedMediaPreview";

export interface AgentGeneratedMediaPreviewButtonProps extends ButtonProps {
  surface?: AgentGeneratedMediaPreviewSurface;
}

export const AgentGeneratedMediaPreviewButton = React.forwardRef<HTMLButtonElement, AgentGeneratedMediaPreviewButtonProps>(
  ({ className, surface = "muted", variant = "ghost", size = "md", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        data-surface={surface}
        className={cn("ms-agent-generated-media-preview ms-agent-generated-media-preview--button", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedMediaPreviewButton.displayName = "AgentGeneratedMediaPreviewButton";
