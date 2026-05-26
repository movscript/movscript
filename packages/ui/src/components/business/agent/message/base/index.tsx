"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import type { AgentMessageRole } from "../../types";

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
      <div ref={ref} className={cn("ms-agent-avatar ms-agent-message__avatar", className)} {...props}>
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
    return <div ref={ref} className={cn("ms-agent-cluster ms-agent-message__meta", className)} {...props} />;
  }
);

AgentMessageMeta.displayName = "AgentMessageMeta";

export const AgentMessageContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-bubble ms-agent-message__content", className)} {...props} />;
  }
);

AgentMessageContent.displayName = "AgentMessageContent";

export const AgentMessageActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-cluster ms-agent-message__actions", className)} {...props} />;
  }
);

AgentMessageActions.displayName = "AgentMessageActions";
