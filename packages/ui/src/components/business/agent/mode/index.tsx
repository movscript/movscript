import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../lib/cn";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenuContent,
  type ButtonProps,
} from "../../../primitives";
import { AgentConversationItem, AgentNavItem } from "../shell/sidebar";

export function AgentModeRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("project-agent-mode agent-mode-root", className)} {...props} />;
}

export function AgentModeFullscreenLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-fullscreen-layout", className)} {...props} />;
}

export function AgentModeSidebar({
  className,
  resizing = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  resizing?: boolean;
}) {
  return <aside className={cn("agent-mode-sidebar", resizing && "agent-mode-sidebar--resizing", className)} {...props} />;
}

export function AgentModeSidebarTop({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-sidebar__top", className)} {...props} />;
}

export function AgentModeSidebarScroll({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-sidebar__scroll", className)} {...props} />;
}

export function AgentModeSidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-sidebar__footer", className)} {...props} />;
}

export function AgentModePrimaryNavItem({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem className={cn("agent-mode-nav-item agent-mode-nav-item--primary", className)} {...props} />;
}

export function AgentModeNavLinkItem({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem asChild className={cn("agent-mode-nav-item", className)} {...props} />;
}

export function AgentModeActionNavItem({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem className={cn("agent-mode-nav-item", className)} {...props} />;
}

export function AgentModeCompactNavItem({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem density="compact" className={cn("agent-mode-nav-item agent-mode-nav-item--compact", className)} {...props} />;
}

export function AgentModeGroup({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-mode-group", className)} {...props} />;
}

export function AgentModeGroupToggle({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem density="compact" className={cn("agent-mode-group__toggle", className)} {...props} />;
}

export function AgentModeGroupBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-group__body", className)} {...props} />;
}

export function AgentModeGroupList({ className, nested = false, ...props }: HTMLAttributes<HTMLDivElement> & { nested?: boolean }) {
  return <div className={cn("agent-mode-group__list", nested && "agent-mode-group__list--nested", className)} {...props} />;
}

export function AgentModeProjectGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-project-group", className)} {...props} />;
}

export function AgentModeProjectGroupToggle({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem density="compact" className={cn("agent-mode-project-group__toggle", className)} {...props} />;
}

export function AgentModeIconSlot({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-mode-icon", className)} {...props} />;
}

export function AgentModeLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-mode-label", className)} {...props} />;
}

export function AgentModeMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-mode-meta", className)} {...props} />;
}

export function AgentModeEmptyText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-mode-empty-text", className)} {...props} />;
}

export function AgentModeConversationRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-conversation-row", className)} {...props} />;
}

export function AgentModeConversationItem({
  className,
  hasAction = false,
  ...props
}: ComponentProps<typeof AgentConversationItem> & {
  hasAction?: boolean;
}) {
  return <AgentConversationItem className={cn("agent-mode-conversation", hasAction && "agent-mode-conversation--with-action", className)} {...props} />;
}

export function AgentModeConversationArchiveButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="icon-xs" variant="ghost" className={cn("agent-mode-conversation__archive", className)} {...props} />;
}

export function AgentModeUserTrigger({ className, ...props }: ComponentProps<typeof AgentNavItem>) {
  return <AgentNavItem className={cn("agent-mode-user-trigger", className)} {...props} />;
}

export function AgentModeUserAvatar({
  fallback,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  fallback: ReactNode;
}) {
  return (
    <Avatar className={cn("agent-mode-user-avatar", className)}>
      <AvatarFallback className="agent-mode-user-avatar__fallback" {...props}>
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}

export function AgentModeUserCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-user-copy", className)} {...props} />;
}

export function AgentModeUserName({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-mode-user-name", className)} {...props} />;
}

export function AgentModeUserMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-mode-user-meta", className)} {...props} />;
}

export function AgentModeUserMenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="start" className={cn("agent-mode-user-menu", className)} {...props} />;
}

export function AgentModeUserMenuLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-user-menu__label", className)} {...props} />;
}

export function AgentModeUserMenuName({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-mode-user-menu__name", className)} {...props} />;
}

export function AgentModeUserMenuRole({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-mode-user-menu__role", className)} {...props} />;
}

export function AgentModeResizeHandle({
  className,
  side = "right",
  active = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  side?: "left" | "right";
  active?: boolean;
}) {
  return <div className={cn("agent-mode-resize-handle", `agent-mode-resize-handle--${side}`, active && "agent-mode-resize-handle--active", className)} {...props} />;
}

export const AgentModeWorkspace = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <section ref={ref} className={cn("agent-mode-workspace", className)} {...props} />;
  }
);
AgentModeWorkspace.displayName = "AgentModeWorkspace";

export function AgentModeChatSurface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-mode-chat-surface", className)} {...props} />;
}

export function AgentModeChatSurfaceInner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-mode-chat-surface__inner", className)} {...props} />;
}

export function AgentModeProjectSelectButton({ className, ...props }: ButtonProps) {
  return <Button type="button" variant="ghost" className={cn("agent-page-project-select-card", className)} {...props} />;
}

export function AgentModeProjectMenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="center" className={cn("agent-mode-project-menu", className)} {...props} />;
}

export function AgentModeContentPanel({
  className,
  resizing = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  resizing?: boolean;
}) {
  return <aside className={cn("agent-mode-content-panel", resizing && "agent-mode-content-panel--resizing", className)} {...props} />;
}
