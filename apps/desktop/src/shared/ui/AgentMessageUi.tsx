"use client";

import * as React from "react";
import { Badge, Button, StatusBadge, type BadgeProps, type ButtonProps, type StatusBadgeProps } from "@movscript/ui/primitives";
import { ReviewCallout } from "@movscript/ui/business/review";

import { cn } from "@/shared/ui/cn";
import "./AgentMessageUi.css";

export type AgentMessageRole = "assistant" | "user" | "system" | "tool";

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
  },
);

AgentMessage.displayName = "AgentMessage";

export interface AgentMessageAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

export const AgentMessageAvatar = React.forwardRef<HTMLDivElement, AgentMessageAvatarProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("ms-inline-center ms-agent-avatar ms-agent-message__avatar", className)} {...props}>
        {children ?? label}
      </div>
    );
  },
);

AgentMessageAvatar.displayName = "AgentMessageAvatar";

export const AgentMessageBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__body", className)} {...props} />;
  },
);

AgentMessageBody.displayName = "AgentMessageBody";

export const AgentMessageHead = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-message__head", className)} {...props} />;
  },
);

AgentMessageHead.displayName = "AgentMessageHead";

export const AgentMessageMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-message__meta", className)} {...props} />;
  },
);

AgentMessageMeta.displayName = "AgentMessageMeta";

export const AgentMessageContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-bubble ms-agent-message__content", className)} {...props} />;
  },
);

AgentMessageContent.displayName = "AgentMessageContent";

export const AgentMessageActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-message__actions", className)} {...props} />;
  },
);

AgentMessageActions.displayName = "AgentMessageActions";

export interface AgentChatMessageProps extends Omit<AgentMessageProps, "role"> {
  role?: AgentMessageRole;
  avatar?: React.ReactNode;
  author?: React.ReactNode;
  time?: React.ReactNode;
  head?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
}

export const AgentChatMessage = React.forwardRef<HTMLDivElement, AgentChatMessageProps>(
  ({ className, role = "assistant", avatar, author, time, head, actions, footer, contentClassName, children, selected, ...props }, ref) => {
    return (
      <AgentMessage ref={ref} role={role} selected={selected} className={cn("group", className)} {...props}>
        <AgentMessageAvatar label={avatar} />
        <AgentMessageBody>
          {head || author || time || actions ? (
            <AgentMessageHead>
              {head ? <div className="ms-agent-message__head-content">{head}</div> : null}
              {author || time ? (
                <AgentMessageMeta>
                  {author ? <span>{author}</span> : null}
                  {time ? <span>{time}</span> : null}
                </AgentMessageMeta>
              ) : null}
              {actions ? <AgentMessageActions>{actions}</AgentMessageActions> : null}
            </AgentMessageHead>
          ) : null}
          <AgentMessageContent className={contentClassName}>{children}</AgentMessageContent>
          {footer}
        </AgentMessageBody>
      </AgentMessage>
    );
  },
);

AgentChatMessage.displayName = "AgentChatMessage";

export const AgentChatBubbleStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-bubble-stack", className)} {...props} />;
  },
);

AgentChatBubbleStack.displayName = "AgentChatBubbleStack";

export const AgentChatContentStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-content-stack", className)} {...props} />;
  },
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
  },
);

AgentChatFooterBadges.displayName = "AgentChatFooterBadges";

export const AgentChatTinyBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => {
    return <Badge ref={ref} className={cn("ms-agent-chat-tiny-badge", className)} {...props} />;
  },
);

AgentChatTinyBadge.displayName = "AgentChatTinyBadge";

export const AgentChatTinyStatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, ...props }, ref) => {
    return <StatusBadge ref={ref} className={cn("ms-agent-chat-tiny-badge", className)} {...props} />;
  },
);

AgentChatTinyStatusBadge.displayName = "AgentChatTinyStatusBadge";

export const AgentChatStatusLine = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-status-line", className)} {...props} />;
  },
);

AgentChatStatusLine.displayName = "AgentChatStatusLine";

export const AgentChatResultStack = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-chat-result-stack", className)} {...props} />;
  },
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
  },
);

AgentChatAttachmentGrid.displayName = "AgentChatAttachmentGrid";

export type AgentMessageSectionTone = "neutral" | "result" | "process" | "diagnostic";

export interface AgentMessageSectionProps {
  title: React.ReactNode;
  tone?: AgentMessageSectionTone;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function AgentMessageSection({
  title,
  tone = "neutral",
  defaultOpen = true,
  children,
}: AgentMessageSectionProps) {
  const className = cn("ms-agent-message-section", `ms-agent-message-section--${tone}`);
  if (!defaultOpen) {
    return (
      <details className={className} data-tone={tone}>
        <summary className="ms-agent-message-section__summary">{title}</summary>
        <div className="ms-agent-message-section__body">{children}</div>
      </details>
    );
  }
  return (
    <section className={className} data-tone={tone}>
      <div className="ms-agent-message-section__title">{title}</div>
      {children}
    </section>
  );
}

export function AgentModelSetupCallout({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <ReviewCallout tone="warning" compact className={cn("ms-agent-model-setup-callout", className)} {...props} />;
}

export const AgentModelSetupCalloutBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-model-setup-callout__body", className)} {...props} />;
  },
);

AgentModelSetupCalloutBody.displayName = "AgentModelSetupCalloutBody";

export const AgentModelSetupCalloutIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-model-setup-callout__icon", className)} {...props} />;
  },
);

AgentModelSetupCalloutIcon.displayName = "AgentModelSetupCalloutIcon";

export const AgentModelSetupCalloutContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-model-setup-callout__content", className)} {...props} />;
  },
);

AgentModelSetupCalloutContent.displayName = "AgentModelSetupCalloutContent";

export const AgentModelSetupCalloutTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-model-setup-callout__title", className)} {...props} />;
  },
);

AgentModelSetupCalloutTitle.displayName = "AgentModelSetupCalloutTitle";

export const AgentModelSetupCalloutDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-model-setup-callout__description", className)} {...props} />;
  },
);

AgentModelSetupCalloutDescription.displayName = "AgentModelSetupCalloutDescription";

export const AgentModelSetupCalloutAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "xs", variant = "outline", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-model-setup-callout__action", className)} {...props} />;
  },
);

AgentModelSetupCalloutAction.displayName = "AgentModelSetupCalloutAction";
