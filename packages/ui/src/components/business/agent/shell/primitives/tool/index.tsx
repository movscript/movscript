"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";
import { Frame, FrameBody, FrameHeader } from "../../../../../primitives";
import type { AgentStepState } from "../../../types";

export interface AgentToolCallProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  state?: AgentStepState;
  title?: React.ReactNode;
  meta?: React.ReactNode;
}

export const AgentToolCall = React.forwardRef<HTMLDivElement, AgentToolCallProps>(
  ({ className, state = "pending", title, meta, children, ...props }, ref) => {
    return (
      <Frame
        ref={ref}
        kind="item"
        density="normal"
        emphasis="muted"
        data-state={state}
        className={cn("ms-agent-frame ms-agent-tool", `ms-agent-tool--${state}`, className)}
        {...props}
      >
        {title || meta ? (
          <FrameHeader className="ms-agent-tool__header">
            <span className="ms-agent-tool__state" aria-hidden="true" />
            {title ? <span className="ms-agent-text ms-text-truncate ms-type-item ms-frame__title ms-agent-tool__title">{title}</span> : null}
            {meta ? <span className="ms-agent-text ms-agent-text--meta ms-type-label ms-agent-tool__meta">{meta}</span> : null}
          </FrameHeader>
        ) : null}
        {children ? <FrameBody className="ms-type-item ms-agent-tool__content">{children}</FrameBody> : null}
      </Frame>
    );
  }
);

AgentToolCall.displayName = "AgentToolCall";

export const AgentStepList = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(
  ({ className, ...props }, ref) => {
    return <ol ref={ref} className={cn("ms-stack ms-agent-steps", className)} {...props} />;
  }
);

AgentStepList.displayName = "AgentStepList";

export interface AgentStepProps extends React.LiHTMLAttributes<HTMLLIElement> {
  state?: AgentStepState;
}

export const AgentStep = React.forwardRef<HTMLLIElement, AgentStepProps>(
  ({ className, state = "pending", ...props }, ref) => {
    return (
      <li
        ref={ref}
        data-state={state}
        className={cn("ms-type-item ms-agent-step", `ms-agent-step--${state}`, className)}
        {...props}
      />
    );
  }
);

AgentStep.displayName = "AgentStep";
