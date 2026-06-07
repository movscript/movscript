"use client";

import * as React from "react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppControlGroup, AppProgressBar } from "../../app";
import { Badge, Button } from "../../../primitives";
import { AgentInlineEmpty } from "../shell/primitives";

export function AgentPinnedStatusRoot({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={cn("agent-pinned-status-root", className)} {...props} />;
}

export function AgentPinnedStatusSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-surface", className)} {...props} />;
}

export function AgentPinnedStatusHeader({
  expanded,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  expanded?: boolean;
}) {
  return <div className={cn("agent-pinned-status-header", expanded && "agent-pinned-status-header--expanded", className)} {...props} />;
}

export function AgentPinnedStatusHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-header__copy", className)} {...props} />;
}

export function AgentPinnedStatusTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-title-row", className)} {...props} />;
}

export function AgentPinnedStatusActiveCount({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-pinned-status-active-count", className)} {...props} />;
}

export function AgentPinnedStatusSummaryRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-summary-row", className)} {...props} />;
}

export function AgentPinnedStatusHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-header__actions", className)} {...props} />;
}

export function AgentPinnedStatusTabGroup({ className, ...props }: ComponentProps<typeof AppControlGroup>) {
  return <AppControlGroup className={cn("agent-pinned-status-tabs", className)} {...props} />;
}

export function AgentPinnedStatusTabButton({
  active,
  className,
  children,
  count,
  ...props
}: ComponentProps<typeof Button> & {
  active?: boolean;
  count?: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "soft" : "ghost"}
      size="xs"
      className={cn("agent-pinned-status-tab", className)}
      {...props}
    >
      {children}
      {count !== undefined ? <span className="agent-pinned-status-tab__count">{count}</span> : null}
    </Button>
  );
}

export function AgentPinnedStatusCollapseIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-pinned-status-collapse-icon", className)} {...props} />;
}

export function AgentPinnedStatusBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-body", className)} {...props} />;
}

export function AgentPinnedStatusList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-list", className)} {...props} />;
}

export function AgentPinnedStatusEmpty({ className, ...props }: ComponentProps<typeof AgentInlineEmpty>) {
  return <AgentInlineEmpty className={cn("agent-pinned-status-empty", className)} {...props} />;
}

export function AgentPinnedStatusWorkerRow({
  title,
  detail,
  progress,
  status,
}: {
  title: ReactNode;
  detail: ReactNode;
  progress?: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className="agent-pinned-status-worker-row">
      <div className="agent-pinned-status-worker-row__copy">
        <div className="agent-pinned-status-worker-row__title">{title}</div>
        <div className="agent-pinned-status-worker-row__detail">{detail}</div>
      </div>
      <div className="agent-pinned-status-worker-row__status">
        {progress !== undefined ? <span>{progress}</span> : null}
        <AgentPinnedStatusBadge>{status}</AgentPinnedStatusBadge>
      </div>
    </div>
  );
}

export function AgentPinnedStatusBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge variant="outline" className={cn("agent-pinned-status-badge", className)} {...props} />;
}

export function AgentPinnedStatusGenerationLine({
  title,
  detail,
  badge,
  progress,
  tone,
}: {
  title: ReactNode;
  detail: ReactNode;
  badge: ReactNode;
  progress: number;
  tone?: ComponentProps<typeof AppProgressBar>["tone"];
}) {
  return (
    <div className="agent-pinned-status-generation-line">
      <div className="agent-pinned-status-generation-line__header">
        <div className="agent-pinned-status-generation-line__copy">
          <div className="agent-pinned-status-generation-line__title">{title}</div>
          <div className="agent-pinned-status-generation-line__detail">{detail}</div>
        </div>
        <AgentPinnedStatusBadge>{badge}</AgentPinnedStatusBadge>
      </div>
      <AgentPinnedStatusProgress value={progress} tone={tone} />
    </div>
  );
}

export function AgentPinnedStatusProgress(props: ComponentProps<typeof AppProgressBar>) {
  return <AppProgressBar size="xs" {...props} />;
}

export function AgentPinnedStatusPlanBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-plan-block", className)} {...props} />;
}

export function AgentPinnedStatusPlanHeader({
  title,
  meta,
  badge,
}: {
  title: ReactNode;
  meta: ReactNode;
  badge: ReactNode;
}) {
  return (
    <div className="agent-pinned-status-plan-header">
      <div className="agent-pinned-status-plan-header__copy">
        <div className="agent-pinned-status-plan-header__title">{title}</div>
        <div className="agent-pinned-status-plan-header__meta">{meta}</div>
      </div>
      <AgentPinnedStatusBadge>{badge}</AgentPinnedStatusBadge>
    </div>
  );
}

export function AgentPinnedStatusPlanMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-plan-meta-row", className)} {...props} />;
}

export function AgentPinnedStatusTruncatedText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-pinned-status-truncated-text", className)} {...props} />;
}

export function AgentPinnedStatusPlanSteps({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-plan-steps", className)} {...props} />;
}

export function AgentPinnedStatusPlanStep({
  completed,
  icon,
  children,
}: {
  completed?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-pinned-status-plan-step">
      {icon}
      <span className={cn("agent-pinned-status-plan-step__text", completed && "agent-pinned-status-plan-step__text--completed")}>
        {children}
      </span>
    </div>
  );
}

export function AgentPinnedStatusDividerRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-pinned-status-divider-row", className)} {...props} />;
}

export function AgentPinnedStatusInlineAction({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" size="xs" variant="ghost" className={cn("agent-pinned-status-inline-action", className)} {...props} />;
}
