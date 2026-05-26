"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { ReviewCallout } from "../../../review";

export function AgentModelSetupCallout({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <ReviewCallout tone="warning" compact className={cn("ms-agent-model-setup-callout", className)} {...props} />;
}

export const AgentModelSetupCalloutBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-model-setup-callout__body", className)} {...props} />;
  }
);

AgentModelSetupCalloutBody.displayName = "AgentModelSetupCalloutBody";

export const AgentModelSetupCalloutIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-model-setup-callout__icon", className)} {...props} />;
  }
);

AgentModelSetupCalloutIcon.displayName = "AgentModelSetupCalloutIcon";

export const AgentModelSetupCalloutContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-model-setup-callout__content", className)} {...props} />;
  }
);

AgentModelSetupCalloutContent.displayName = "AgentModelSetupCalloutContent";

export const AgentModelSetupCalloutTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-model-setup-callout__title", className)} {...props} />;
  }
);

AgentModelSetupCalloutTitle.displayName = "AgentModelSetupCalloutTitle";

export const AgentModelSetupCalloutDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-model-setup-callout__description", className)} {...props} />;
  }
);

AgentModelSetupCalloutDescription.displayName = "AgentModelSetupCalloutDescription";

export const AgentModelSetupCalloutAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", variant = "outline", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-model-setup-callout__action", className)} {...props} />;
  }
);

AgentModelSetupCalloutAction.displayName = "AgentModelSetupCalloutAction";
