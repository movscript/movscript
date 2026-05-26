"use client";

import * as React from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, StatusBadge, type BadgeProps, type StatusBadgeProps } from "../../../../primitives/badge";
import type { AgentMessageRole } from "../../types";
import {
  AgentMessage,
  AgentMessageActions,
  AgentMessageAvatar,
  AgentMessageBody,
  AgentMessageContent,
  AgentMessageMeta,
  type AgentMessageProps,
} from "../base";

export interface AgentChatMessageProps extends Omit<AgentMessageProps, "role"> {
  role?: AgentMessageRole;
  avatar?: React.ReactNode;
  author?: React.ReactNode;
  time?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
}

export const AgentChatMessage = React.forwardRef<HTMLDivElement, AgentChatMessageProps>(
  ({ className, role = "assistant", avatar, author, time, actions, footer, contentClassName, children, selected, ...props }, ref) => {
    return (
      <AgentMessage ref={ref} role={role} selected={selected} className={cn("group", className)} {...props}>
        <AgentMessageAvatar label={avatar} />
        <AgentMessageBody>
          {(author || time || actions) ? (
            <AgentMessageMeta>
              {author ? <span>{author}</span> : null}
              {time ? <span>{time}</span> : null}
              {actions ? <AgentMessageActions>{actions}</AgentMessageActions> : null}
            </AgentMessageMeta>
          ) : null}
          <AgentMessageContent className={contentClassName}>{children}</AgentMessageContent>
          {footer}
        </AgentMessageBody>
      </AgentMessage>
    );
  }
);

AgentChatMessage.displayName = "AgentChatMessage";

export const AgentChatBubbleStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-bubble-stack", className)} {...props} />;
  }
);

AgentChatBubbleStack.displayName = "AgentChatBubbleStack";

export const AgentChatContentStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-content-stack", className)} {...props} />;
  }
);

AgentChatContentStack.displayName = "AgentChatContentStack";

export interface AgentChatFooterBadgesProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

export const AgentChatFooterBadges = React.forwardRef<HTMLDivElement, AgentChatFooterBadgesProps>(
  ({ align = "start", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-align={align}
        className={cn("ms-agent-chat-footer-badges", className)}
        {...props}
      />
    );
  }
);

AgentChatFooterBadges.displayName = "AgentChatFooterBadges";

export const AgentChatTinyBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => {
    return <Badge ref={ref} className={cn("ms-agent-chat-tiny-badge", className)} {...props} />;
  }
);

AgentChatTinyBadge.displayName = "AgentChatTinyBadge";

export const AgentChatTinyStatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-agent-chat-tiny-badge", className)} {...props} />;
  }
);

AgentChatTinyStatusBadge.displayName = "AgentChatTinyStatusBadge";

export const AgentChatStatusLine = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-status-line", className)} {...props} />;
  }
);

AgentChatStatusLine.displayName = "AgentChatStatusLine";

export const AgentChatResultStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-result-stack", className)} {...props} />;
  }
);

AgentChatResultStack.displayName = "AgentChatResultStack";

export interface AgentChatAttachmentGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2;
}

export const AgentChatAttachmentGrid = React.forwardRef<HTMLDivElement, AgentChatAttachmentGridProps>(
  ({ columns = 1, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-columns={columns}
        className={cn("ms-agent-chat-attachment-grid", className)}
        {...props}
      />
    );
  }
);

AgentChatAttachmentGrid.displayName = "AgentChatAttachmentGrid";
