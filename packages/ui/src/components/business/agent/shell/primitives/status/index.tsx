"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";
import { toneTextClass } from "../../../../../../semantic";
import { AgentDataBlock } from "../../../run";

export const AgentInlineEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <AgentDataBlock ref={ref} className={cn("ms-agent-inline-empty", className)} {...props} />;
  }
);

AgentInlineEmpty.displayName = "AgentInlineEmpty";

export const ProviderSessionStatusContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-session-status", className)} {...props} />;
  }
);

ProviderSessionStatusContent.displayName = "ProviderSessionStatusContent";

export const ProviderSessionStatusHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-type-caption ms-agent-session-status__header", className)} {...props} />;
  }
);

ProviderSessionStatusHeader.displayName = "ProviderSessionStatusHeader";

export const ProviderSessionStatusSuccessIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-inline-center ms-agent-session-status__icon", toneTextClass("success"), className)} {...props} />;
  }
);

ProviderSessionStatusSuccessIcon.displayName = "ProviderSessionStatusSuccessIcon";

export const ProviderSessionStatusDetail = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-type-item ms-agent-session-status__detail", className)} {...props} />;
  }
);

ProviderSessionStatusDetail.displayName = "ProviderSessionStatusDetail";
