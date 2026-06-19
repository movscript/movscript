"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { AppCodeBlock } from "../../../app";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export interface AgentCodeBlockProps extends AgentSurfaceBlockProps {}

export const AgentCodeBlock = React.forwardRef<HTMLElement, AgentCodeBlockProps>(
  ({ className, variant = "surface", ...props }, ref) => {
    return (
      <AgentSurfaceBlock
        ref={ref}
        variant={variant}
        className={cn("ms-agent-code-block", className)}
        {...props}
      />
    );
  }
);

AgentCodeBlock.displayName = "AgentCodeBlock";

export const AgentCodeBlockHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-code-block__header", className)} {...props} />;
  }
);

AgentCodeBlockHeader.displayName = "AgentCodeBlockHeader";

export const AgentCodeBlockTitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-code-block__title", className)} {...props} />;
  }
);

AgentCodeBlockTitle.displayName = "AgentCodeBlockTitle";

export const AgentCodeBlockActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "icon-xs", variant = "ghost", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        variant={variant}
        className={cn("ms-agent-code-block__action", className)}
        {...props}
      />
    );
  }
);

AgentCodeBlockActionButton.displayName = "AgentCodeBlockActionButton";

export function AgentCodeBlockContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <AppCodeBlock className={cn("ms-agent-code-block__content", className)} {...props} />;
}
