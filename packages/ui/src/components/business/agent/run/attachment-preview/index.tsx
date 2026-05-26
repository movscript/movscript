"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export type AgentAttachmentPreviewDensity = "default" | "compact";
export type AgentAttachmentPreviewSurface = "muted" | "dark";

export interface AgentAttachmentPreviewCardProps extends AgentSurfaceBlockProps {
  density?: AgentAttachmentPreviewDensity;
}

export const AgentAttachmentPreviewCard = React.forwardRef<HTMLDivElement, AgentAttachmentPreviewCardProps>(
  ({ className, density = "default", variant = "surface", ...props }, ref) => {
    return (
      <AgentSurfaceBlock
        ref={ref}
        data-density={density}
        variant={variant}
        className={cn("ms-agent-attachment-preview", className)}
        {...props}
      />
    );
  }
);

AgentAttachmentPreviewCard.displayName = "AgentAttachmentPreviewCard";

export interface AgentAttachmentPreviewMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: AgentAttachmentPreviewSurface;
}

export const AgentAttachmentPreviewMedia = React.forwardRef<HTMLDivElement, AgentAttachmentPreviewMediaProps>(
  ({ className, surface = "muted", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-surface={surface}
        className={cn("ms-agent-attachment-preview__media", className)}
        {...props}
      />
    );
  }
);

AgentAttachmentPreviewMedia.displayName = "AgentAttachmentPreviewMedia";

export const AgentAttachmentPreviewFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-attachment-preview__fallback", className)} {...props} />;
  }
);

AgentAttachmentPreviewFallback.displayName = "AgentAttachmentPreviewFallback";

export const AgentAttachmentPreviewBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-attachment-preview__body", className)} {...props} />;
  }
);

AgentAttachmentPreviewBody.displayName = "AgentAttachmentPreviewBody";
