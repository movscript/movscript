"use client";

import * as React from "react";
import { CircleIcon, SparklesIcon } from "../../../../primitives/icons";
import { cn } from "../../../../../lib/cn";
import type { AgentDensity, AgentRunState } from "../../types";

export interface AgentShellProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: AgentDensity;
}

export const AgentShell = React.forwardRef<HTMLDivElement, AgentShellProps>(
  ({ className, density = "comfortable", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-density={density}
        className={cn("ms-agent-container ms-agent-shell", `ms-agent-shell--${density}`, className)}
        {...props}
      />
    );
  }
);

AgentShell.displayName = "AgentShell";

export const AgentMain = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <main ref={ref} className={cn("ms-agent-main", className)} {...props} />;
  }
);

AgentMain.displayName = "AgentMain";

export const AgentHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-bar ms-agent-header", className)} {...props} />;
  }
);

AgentHeader.displayName = "AgentHeader";

export const AgentHeaderContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-titleblock ms-agent-header__content", className)} {...props} />;
  }
);

AgentHeaderContent.displayName = "AgentHeaderContent";

export const AgentHeaderActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-actions ms-agent-header__actions", className)} {...props} />;
  }
);

AgentHeaderActions.displayName = "AgentHeaderActions";

export const AgentTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h1 ref={ref} className={cn("ms-agent-text ms-agent-text--truncate ms-agent-title", className)} {...props} />;
  }
);

AgentTitle.displayName = "AgentTitle";

export const AgentSubtitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-subtitle", className)} {...props} />;
  }
);

AgentSubtitle.displayName = "AgentSubtitle";

export interface AgentStatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  state?: AgentRunState;
}

export const AgentStatus = React.forwardRef<HTMLSpanElement, AgentStatusProps>(
  ({ className, state = "idle", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-state={state}
        className={cn("ms-agent-pill ms-agent-status", `ms-agent-status--${state}`, className)}
        {...props}
      >
        <CircleIcon className="ms-agent-status__icon" />
        <span>{children}</span>
      </span>
    );
  }
);

AgentStatus.displayName = "AgentStatus";

export const AgentBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-body", className)} {...props} />;
  }
);

AgentBody.displayName = "AgentBody";

export const AgentThread = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-thread", className)} {...props} />;
  }
);

AgentThread.displayName = "AgentThread";

export const AgentEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("ms-agent-empty", className)} {...props}>
        <span className="ms-agent-avatar ms-agent-empty__icon" aria-hidden="true">
          <SparklesIcon />
        </span>
        {children}
      </div>
    );
  }
);

AgentEmpty.displayName = "AgentEmpty";
