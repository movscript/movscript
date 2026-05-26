"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../../surface-block";

export const AgentGeneratedResultCard = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "surface", ...props }, ref) => {
    return (
      <AgentSurfaceBlock
        ref={ref}
        variant={variant}
        className={cn("ms-agent-generated-result-card", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedResultCard.displayName = "AgentGeneratedResultCard";

export const AgentGeneratedResultList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-result-card__list", className)} {...props} />;
  }
);

AgentGeneratedResultList.displayName = "AgentGeneratedResultList";
