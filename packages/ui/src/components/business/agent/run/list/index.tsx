"use client";

import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { AsChildSlot } from "../../../../../lib/asChild";
import { cn } from "../../../../../lib/cn";
import { AppInlineError, AppStateMessage } from "../../../app";
import { Badge, Button, Input, StatusBadge, type ButtonProps, type InputProps, type StatusBadgeProps } from "../../../../primitives";
import { AgentSurfaceBlock } from "../../surface-block";
import type { IconComponent } from "../../../../primitives/types";

export function AgentRunsPageHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-page-header", className)} {...props} />;
}

export function AgentRunsPageHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-page-header__copy", className)} {...props} />;
}

export function AgentRunsPageTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-page-header__title-row", className)} {...props} />;
}

export function AgentRunsPageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-runs-page-header__title", className)} {...props} />;
}

export function AgentRunsPageDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-runs-page-header__description", className)} {...props} />;
}

export function AgentRunsIcon({ icon: Icon, size = 14, spinning = false }: { icon: IconComponent; size?: number; spinning?: boolean }) {
  return <Icon size={size} className={spinning ? "agent-runs-icon--spinning" : undefined} />;
}

export function AgentRunsHeaderStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-runs-header-status-badge", className)} {...props} />;
}

export function AgentRunsRefreshButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="sm" variant="outline" className={cn("agent-runs-refresh-button", className)} {...props} />;
}

export function AgentRunsMetricGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-runs-metric-grid", className)} {...props} />;
}

export function AgentRunsPanel({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock className={cn("agent-runs-panel", className)} {...props} />;
}

export function AgentRunsToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-toolbar", className)} {...props} />;
}

export function AgentRunsSearchBox({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("agent-runs-search-box", className)} {...props}>
      {icon ? <span className="agent-runs-search-box__icon">{icon}</span> : null}
      {children}
    </div>
  );
}

export function AgentRunsSearchInput({ className, ...props }: InputProps) {
  return <Input className={cn("agent-runs-search-input", className)} {...props} />;
}

export function AgentRunsFilterGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-filter-group", className)} {...props} />;
}

export function AgentRunsFilterButton({
  active,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "soft" : "ghost"}
      className={cn("agent-runs-filter-button", className)}
      {...props}
    />
  );
}

export function AgentRunsPanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-panel-body", className)} {...props} />;
}

export function AgentRunsStateMessage({ className, ...props }: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("agent-runs-state-message", className)} {...props} />;
}

export function AgentRunsInlineError({ className, ...props }: ComponentProps<typeof AppInlineError>) {
  return <AppInlineError className={cn("agent-runs-inline-error", className)} {...props} />;
}

export function AgentRunsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-list", className)} {...props} />;
}

export function AgentRunsRecordItem({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="subtle" className={cn("agent-runs-record", className)} {...props} />;
}

export function AgentRunsRecordLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-record__layout", className)} {...props} />;
}

export function AgentRunsRecordMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-record__main", className)} {...props} />;
}

export function AgentRunsRecordHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-record__header", className)} {...props} />;
}

export function AgentRunsRecordIdLink({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? AsChildSlot : "a";
  return <Comp className={cn("agent-runs-record__id-link", className)} {...props} />;
}

export function AgentRunsRecordMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-record__meta", className)} {...props} />;
}

export function AgentRunsRecordMetaItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-runs-record__meta-item", className)} {...props} />;
}

export function AgentRunsRecordDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-runs-record__description", className)} {...props} />;
}

export function AgentRunsRecordActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-runs-record__actions", className)} {...props} />;
}

export function AgentRunsBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn("agent-runs-badge", className)} {...props} />;
}

export function AgentRunsStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-runs-status-badge", className)} {...props} />;
}

export function AgentRunsActionButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" variant="outline" className={cn("agent-runs-action-button", className)} {...props} />;
}
