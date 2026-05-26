"use client";

import * as React from "react";

import { Badge, type BadgeProps } from "../../../../../primitives/badge";
import { Button, type ButtonProps } from "../../../../../primitives/button";
import { SparklesIcon } from "../../../../../primitives/icons";
import { cn } from "../../../../../../lib/cn";

export const AgentGeneratedResultHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-result-card__header", className)} {...props} />;
  }
);

AgentGeneratedResultHeader.displayName = "AgentGeneratedResultHeader";

export function AgentGeneratedResultTitle({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-agent-generated-result-card__title", className)} {...props}>
      <SparklesIcon className="ms-agent-generated-result-card__title-icon" />
      <span className="ms-agent-generated-result-card__title-text">{children}</span>
    </div>
  );
}

export const AgentGeneratedResultActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-result-card__actions", className)} {...props} />;
  }
);

AgentGeneratedResultActions.displayName = "AgentGeneratedResultActions";

export const AgentGeneratedResultCountBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => {
    return <Badge ref={ref} className={cn("ms-agent-generated-result-card__count", className)} {...props} />;
  }
);

AgentGeneratedResultCountBadge.displayName = "AgentGeneratedResultCountBadge";

export const AgentGeneratedResultActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", ...props }, ref) => {
    return <Button ref={ref} size={size} className={cn("ms-agent-generated-result-card__action", className)} {...props} />;
  }
);

AgentGeneratedResultActionButton.displayName = "AgentGeneratedResultActionButton";
