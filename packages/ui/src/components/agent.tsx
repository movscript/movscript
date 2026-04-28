"use client";

import * as React from "react";
import { ArrowUpIcon, CircleIcon, PaperclipIcon, SparklesIcon, StopIcon } from "./icons";
import { cn } from "../lib/cn";

export type AgentDensity = "comfortable" | "compact";
export type AgentMessageRole = "assistant" | "user" | "system" | "tool";
export type AgentRunState = "idle" | "ready" | "running" | "paused" | "error";
export type AgentStepState = "pending" | "running" | "done" | "error";

export interface AgentShellProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: AgentDensity;
}

export const AgentShell = React.forwardRef<HTMLDivElement, AgentShellProps>(
  ({ className, density = "comfortable", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-density={density}
        className={cn("ms-agent-shell", `ms-agent-shell--${density}`, className)}
        {...props}
      />
    );
  }
);

AgentShell.displayName = "AgentShell";

export const AgentSidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <aside ref={ref} className={cn("ms-agent-sidebar", className)} {...props} />;
  }
);

AgentSidebar.displayName = "AgentSidebar";

export const AgentSidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-sidebar__header", className)} {...props} />;
  }
);

AgentSidebarHeader.displayName = "AgentSidebarHeader";

export const AgentSidebarSection = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-sidebar__section", className)} {...props} />;
  }
);

AgentSidebarSection.displayName = "AgentSidebarSection";

export const AgentSidebarTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h2 ref={ref} className={cn("ms-agent-sidebar__title", className)} {...props} />;
  }
);

AgentSidebarTitle.displayName = "AgentSidebarTitle";

export interface AgentConversationItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  active?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
}

export const AgentConversationItem = React.forwardRef<HTMLButtonElement, AgentConversationItemProps>(
  ({ active = false, title, description, meta, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : undefined}
        className={cn("ms-agent-conversation", className)}
        {...props}
      >
        <span className="ms-agent-conversation__indicator" aria-hidden="true" />
        <span className="ms-agent-conversation__body">
          <span className="ms-agent-conversation__title">{title}</span>
          {description ? <span className="ms-agent-conversation__description">{description}</span> : null}
        </span>
        {meta ? <span className="ms-agent-conversation__meta">{meta}</span> : null}
      </button>
    );
  }
);

AgentConversationItem.displayName = "AgentConversationItem";

export const AgentMain = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <main ref={ref} className={cn("ms-agent-main", className)} {...props} />;
  }
);

AgentMain.displayName = "AgentMain";

export const AgentHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-header", className)} {...props} />;
  }
);

AgentHeader.displayName = "AgentHeader";

export const AgentHeaderContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-header__content", className)} {...props} />;
  }
);

AgentHeaderContent.displayName = "AgentHeaderContent";

export const AgentHeaderActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-header__actions", className)} {...props} />;
  }
);

AgentHeaderActions.displayName = "AgentHeaderActions";

export const AgentTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h1 ref={ref} className={cn("ms-agent-title", className)} {...props} />;
  }
);

AgentTitle.displayName = "AgentTitle";

export const AgentSubtitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-subtitle", className)} {...props} />;
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
        className={cn("ms-agent-status", `ms-agent-status--${state}`, className)}
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
        <span className="ms-agent-empty__icon" aria-hidden="true">
          <SparklesIcon />
        </span>
        {children}
      </div>
    );
  }
);

AgentEmpty.displayName = "AgentEmpty";

export interface AgentMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: AgentMessageRole;
  selected?: boolean;
}

export const AgentMessage = React.forwardRef<HTMLDivElement, AgentMessageProps>(
  ({ className, role = "assistant", selected = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-role={role}
        data-selected={selected ? "true" : undefined}
        className={cn("ms-agent-message", `ms-agent-message--${role}`, className)}
        {...props}
      />
    );
  }
);

AgentMessage.displayName = "AgentMessage";

export interface AgentMessageAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

export const AgentMessageAvatar = React.forwardRef<HTMLDivElement, AgentMessageAvatarProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("ms-agent-message__avatar", className)} {...props}>
        {children ?? label}
      </div>
    );
  }
);

AgentMessageAvatar.displayName = "AgentMessageAvatar";

export const AgentMessageBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__body", className)} {...props} />;
  }
);

AgentMessageBody.displayName = "AgentMessageBody";

export const AgentMessageMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__meta", className)} {...props} />;
  }
);

AgentMessageMeta.displayName = "AgentMessageMeta";

export const AgentMessageContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__content", className)} {...props} />;
  }
);

AgentMessageContent.displayName = "AgentMessageContent";

export const AgentMessageActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__actions", className)} {...props} />;
  }
);

AgentMessageActions.displayName = "AgentMessageActions";

export interface AgentToolCallProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  state?: AgentStepState;
  title?: React.ReactNode;
  meta?: React.ReactNode;
}

export const AgentToolCall = React.forwardRef<HTMLDivElement, AgentToolCallProps>(
  ({ className, state = "pending", title, meta, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-state={state}
        className={cn("ms-agent-tool", `ms-agent-tool--${state}`, className)}
        {...props}
      >
        {(title || meta) ? (
          <div className="ms-agent-tool__header">
            <span className="ms-agent-tool__state" aria-hidden="true" />
            {title ? <span className="ms-agent-tool__title">{title}</span> : null}
            {meta ? <span className="ms-agent-tool__meta">{meta}</span> : null}
          </div>
        ) : null}
        {children ? <div className="ms-agent-tool__content">{children}</div> : null}
      </div>
    );
  }
);

AgentToolCall.displayName = "AgentToolCall";

export const AgentStepList = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(
  ({ className, ...props }, ref) => {
    return <ol ref={ref} className={cn("ms-agent-steps", className)} {...props} />;
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
        className={cn("ms-agent-step", `ms-agent-step--${state}`, className)}
        {...props}
      />
    );
  }
);

AgentStep.displayName = "AgentStep";

export const AgentSuggestions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-suggestions", className)} {...props} />;
  }
);

AgentSuggestions.displayName = "AgentSuggestions";

export const AgentSuggestion = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => {
    return <button ref={ref} type={type} className={cn("ms-agent-suggestion", className)} {...props} />;
  }
);

AgentSuggestion.displayName = "AgentSuggestion";

export const AgentContextPanel = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <aside ref={ref} className={cn("ms-agent-context", className)} {...props} />;
  }
);

AgentContextPanel.displayName = "AgentContextPanel";

export const AgentMetric = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-metric", className)} {...props} />;
  }
);

AgentMetric.displayName = "AgentMetric";

export const AgentComposer = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => {
    return <form ref={ref} className={cn("ms-agent-composer", className)} {...props} />;
  }
);

AgentComposer.displayName = "AgentComposer";

export const AgentComposerToolbar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-composer__toolbar", className)} {...props} />;
  }
);

AgentComposerToolbar.displayName = "AgentComposerToolbar";

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
        className={cn("ms-agent-composer__action", className)}
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
        className={cn("ms-agent-composer__submit", className)}
        {...props}
      >
        {children ?? (running ? <StopIcon /> : <ArrowUpIcon />)}
        <span className="ms-sr-only">{accessibleLabel}</span>
      </button>
    );
  }
);

AgentComposerSubmit.displayName = "AgentComposerSubmit";
