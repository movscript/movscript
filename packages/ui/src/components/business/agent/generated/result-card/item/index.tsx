"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../../surface-block";

export const AgentGeneratedResultItem = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "subtle", ...props }, ref) => {
    return (
      <AgentSurfaceBlock
        ref={ref}
        variant={variant}
        className={cn("ms-agent-generated-result-item", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedResultItem.displayName = "AgentGeneratedResultItem";

export const AgentGeneratedResultItemRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-result-item__row", className)} {...props} />;
  }
);

AgentGeneratedResultItemRow.displayName = "AgentGeneratedResultItemRow";

export const AgentGeneratedResultItemIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-generated-result-item__icon", className)} {...props} />;
  }
);

AgentGeneratedResultItemIcon.displayName = "AgentGeneratedResultItemIcon";

export const AgentGeneratedResultItemBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-result-item__body", className)} {...props} />;
  }
);

AgentGeneratedResultItemBody.displayName = "AgentGeneratedResultItemBody";

export const AgentGeneratedResultItemName = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-result-item__name", className)} {...props} />;
  }
);

AgentGeneratedResultItemName.displayName = "AgentGeneratedResultItemName";

export const AgentGeneratedResultItemMeta = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-result-item__meta", className)} {...props} />;
  }
);

AgentGeneratedResultItemMeta.displayName = "AgentGeneratedResultItemMeta";
