"use client";

import * as React from "react";

import { cn } from "../../../../lib/cn";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "../../../primitives/icons";

export const AgentComposer = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => {
    return <form ref={ref} className={cn("ms-agent-stack ms-agent-composer", className)} {...props} />;
  }
);

AgentComposer.displayName = "AgentComposer";

export const AgentComposerToolbar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-cluster ms-agent-cluster--between ms-agent-composer__toolbar", className)} {...props} />;
  }
);

AgentComposerToolbar.displayName = "AgentComposerToolbar";

export const AgentComposerDropOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-composer__drop-overlay", className)} {...props} />;
  }
);

AgentComposerDropOverlay.displayName = "AgentComposerDropOverlay";

export interface AgentComposerFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
}

export const AgentComposerField = React.forwardRef<HTMLTextAreaElement, AgentComposerFieldProps>(
  ({ className, minRows = 2, rows, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows ?? minRows}
        className={cn("ms-agent-composer__field", className)}
        {...props}
      />
    );
  }
);

AgentComposerField.displayName = "AgentComposerField";

export interface AgentComposerActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const AgentComposerAction = React.forwardRef<HTMLButtonElement, AgentComposerActionProps>(
  ({ className, active = false, type = "button", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        data-active={active ? "true" : undefined}
        className={cn("ms-control ms-agent-composer__action", className)}
        {...props}
      >
        {children ?? <PaperclipIcon />}
      </button>
    );
  }
);

AgentComposerAction.displayName = "AgentComposerAction";

export interface AgentComposerSubmitProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  running?: boolean;
  label?: string;
}

export const AgentComposerSubmit = React.forwardRef<HTMLButtonElement, AgentComposerSubmitProps>(
  ({ className, running = false, label, type = "submit", children, ...props }, ref) => {
    const accessibleLabel = label ?? (running ? "Stop" : "Send");

    return (
      <button
        ref={ref}
        type={type}
        aria-label={accessibleLabel}
        data-running={running ? "true" : undefined}
        className={cn("ms-control ms-agent-composer__submit", className)}
        {...props}
      >
        {children ?? (running ? <StopIcon /> : <ArrowUpIcon />)}
        <span className="ms-sr-only">{accessibleLabel}</span>
      </button>
    );
  }
);

AgentComposerSubmit.displayName = "AgentComposerSubmit";
