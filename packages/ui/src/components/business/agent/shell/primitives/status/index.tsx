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

export const AgentRuntimeStatusContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-runtime-status", className)} {...props} />;
  }
);

AgentRuntimeStatusContent.displayName = "AgentRuntimeStatusContent";

export const AgentRuntimeStatusHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-runtime-status__header", className)} {...props} />;
  }
);

AgentRuntimeStatusHeader.displayName = "AgentRuntimeStatusHeader";

export const AgentRuntimeStatusSuccessIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-runtime-status__icon", toneTextClass("success"), className)} {...props} />;
  }
);

AgentRuntimeStatusSuccessIcon.displayName = "AgentRuntimeStatusSuccessIcon";

export const AgentRuntimeStatusDetail = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-runtime-status__detail", className)} {...props} />;
  }
);

AgentRuntimeStatusDetail.displayName = "AgentRuntimeStatusDetail";
