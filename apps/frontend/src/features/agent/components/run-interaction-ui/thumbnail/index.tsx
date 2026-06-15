"use client";

import * as React from "react";

import { Frame, type FrameProps } from "@movscript/ui/primitives";
import { cn } from "@/shared/ui/cn";

type AgentRunInteractionSurfaceVariant = "surface" | "subtle" | "card";

interface AgentRunInteractionThumbnailProps extends FrameProps {
  variant?: AgentRunInteractionSurfaceVariant;
}

function agentRunInteractionSurfaceEmphasis(variant: AgentRunInteractionSurfaceVariant) {
  if (variant === "card") return "raised";
  if (variant === "subtle") return "muted";
  return "plain";
}

export const AgentRunInteractionApprovalThumbnail = React.forwardRef<HTMLElement, AgentRunInteractionThumbnailProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return (
      <Frame
        ref={ref}
        kind="panel"
        density="normal"
        emphasis={agentRunInteractionSurfaceEmphasis(variant)}
        data-variant={variant}
        className={cn("ms-agent-frame ms-agent-surface-block", `ms-agent-surface-block--${variant}`, "agent-run-interaction-thumb", className)}
        {...props}
      />
    );
  }
);

AgentRunInteractionApprovalThumbnail.displayName = "AgentRunInteractionApprovalThumbnail";

export const AgentRunInteractionApprovalThumbnailFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("agent-run-interaction-thumb__fallback", className)} {...props} />;
  }
);

AgentRunInteractionApprovalThumbnailFallback.displayName = "AgentRunInteractionApprovalThumbnailFallback";
