import { type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { cn } from "@/shared/ui/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "@movscript/ui/semantic";
import { AppInlineError, AppTextEmptyState } from "@movscript/ui/business/app";
import { AppPageShellBody } from "@movscript/ui/layout";
import { ReviewCallout } from "@movscript/ui/business/review";
import {
  Badge,
  Button,
  StatusBadge,
  type ButtonProps,
  type StatusBadgeProps,
} from "@movscript/ui/primitives";
import type { IconComponent } from "@movscript/ui/primitives";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "@movscript/ui/business/agent";

export {
  AgentConsoleIssueRowSurface,
  AgentConsoleIssueSurfaceBlock,
  AgentConsoleMetricCard,
  type AgentConsoleIssueTone,
} from "@/features/agent/components/AgentConsoleIssueUi";

export {
  AgentConsoleFormField,
  AgentConsoleLocalToolActions,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsoleSelectField,
  AgentConsoleTestResult,
} from "@/features/agent/components/AgentConsoleLocalToolUi";

export {
  AgentConsoleHistoryClearActions,
  AgentConsoleHistoryClearBody,
  AgentConsoleHistoryClearDetail,
  AgentConsoleHistoryClearLayout,
  AgentConsoleHistoryClearTitle,
  AgentConsoleInlineLink,
  AgentConsoleManagementLink,
  AgentConsoleRunSummaryCopy,
  AgentConsoleRunSummaryDetail,
  AgentConsoleRunSummaryHeader,
  AgentConsoleRunSummaryId,
  AgentConsoleRunSummaryLink,
  AgentConsoleRunSummaryMeta,
} from "@/features/agent/components/AgentConsoleCompositeUi";

export function AgentConsoleCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("agent-console-callout", className)} {...props} />;
}

export function AgentConsoleEmptyText({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("agent-console-empty-text", className)} {...props} />;
}

export function AgentConsoleToneText({
  as: Element = "span",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div";
  tone: SemanticTone;
}) {
  return (
    <Element className={cn("agent-console-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  );
}

export function AgentConsoleToneSurfaceBlock({
  tone,
  className,
  ...props
}: AgentSurfaceBlockProps & {
  tone?: SemanticTone;
}) {
  return (
    <AgentSurfaceBlock
      className={cn("agent-console-tone-surface", tone ? toneSurfaceClass(tone) : undefined, className)}
      {...props}
    />
  );
}

export function AgentConsoleHistoryClearSurface({
  className,
  ...props
}: AgentSurfaceBlockProps) {
  return (
    <AgentConsoleToneSurfaceBlock
      data-testid="agent-console-history-clear"
      variant="subtle"
      tone="danger"
      className={cn("agent-console-history-clear", className)}
      {...props}
    />
  );
}

export function AgentConsoleHistoryClearIcon({ className }: { className?: string }) {
  return <Trash2 size={14} className={cn("agent-console-history-clear__icon", toneTextClass("danger"), className)} />;
}

export function AgentConsoleHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-header", className)} {...props} />;
}

export function AgentConsoleHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-header__copy", className)} {...props} />;
}

export function AgentConsoleHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-header__title-row", className)} {...props} />;
}

export function AgentConsoleHeaderTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-console-header__title", className)} {...props} />;
}

export function AgentConsoleHeaderDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-header__description", className)} {...props} />;
}

export function AgentConsoleHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-header__actions", className)} {...props} />;
}

export function AgentConsoleStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-console-status-badge", className)} {...props} />;
}

export function AgentConsoleSyncBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn("agent-console-sync-badge", className)} {...props} />;
}

export function AgentConsoleActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("agent-console-action-button", className)} {...props} />;
}

export function AgentConsoleIcon({
  icon: Icon,
  spinning = false,
  className,
  ...props
}: {
  icon: IconComponent;
  spinning?: boolean;
  className?: string;
} & Omit<ComponentProps<IconComponent>, "className">) {
  return <Icon className={cn("agent-console-icon", spinning && "agent-console-icon--spinning", className)} {...props} />;
}

export function AgentConsolePageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, "scroll">) {
  return <AppPageShellBody scroll="auto" className={cn("agent-console-page-body", className)} {...props} />;
}

export function AgentConsoleDocumentBody(props: ComponentProps<typeof AppPageShellBody>) {
  return <AppPageShellBody {...props} />;
}

export function AgentConsoleMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-metric-grid", className)} {...props} />;
}

export function AgentConsoleSectionSpacer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-section-spacer", className)} {...props} />;
}

export function AgentConsoleMainGrid({
  layout = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  layout?: "default" | "control-logs";
}) {
  return <div data-layout={layout === "control-logs" ? "control-logs" : undefined} className={cn("agent-console-main-grid", className)} {...props} />;
}

export function AgentConsoleMainColumn({
  pane = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  pane?: "default" | "config";
}) {
  return <div data-pane={pane === "config" ? "config" : undefined} className={cn("agent-console-main-column", className)} {...props} />;
}

export function AgentConsoleSidebar({
  pane = "default",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  pane?: "default" | "logs";
}) {
  return <aside data-pane={pane === "logs" ? "logs" : undefined} className={cn("agent-console-sidebar", className)} {...props} />;
}

export function AgentConsoleStack({
  spacing = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  spacing?: "default" | "loose";
}) {
  return <div data-spacing={spacing === "loose" ? "loose" : undefined} className={cn("agent-console-stack", className)} {...props} />;
}

export function AgentConsoleGrid({
  columns = "auto",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "auto" | "single" | "two" | "three" | "server" | "identity" | "runtime" | "auth";
}) {
  return <div data-columns={columns} className={cn("agent-console-grid", className)} {...props} />;
}

export function AgentConsoleDivider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-divider", className)} {...props} />;
}

export function AgentConsolePanel({
  title,
  icon,
  action,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AgentSurfaceBlock as="section" className="agent-console-panel">
      <div className="agent-console-panel__header">
        <div className="agent-console-panel__title-row">
          {icon}
          <h2 className="agent-console-panel__title">{title}</h2>
        </div>
        {action}
      </div>
      <div className="agent-console-panel__body">{children}</div>
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleInlineError({ className, ...props }: ComponentProps<typeof AppInlineError>) {
  return <AppInlineError className={cn("agent-console-inline-error", className)} {...props} />;
}

export function AgentConsoleBoundaryCard({ title, detail }: { title: ReactNode; detail: ReactNode }) {
  return (
    <AgentSurfaceBlock variant="subtle" className="agent-console-boundary-card">
      <p className="agent-console-boundary-card__title">{title}</p>
      <p className="agent-console-boundary-card__detail">{detail}</p>
    </AgentSurfaceBlock>
  );
}

export function AgentConsolePanelActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-panel-actions", className)} {...props} />;
}

export function AgentConsoleSavedText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-saved-text", className)} {...props} />;
}

export function AgentConsoleIntroRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-intro-row", className)} {...props} />;
}

export function AgentConsoleDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-description", className)} {...props} />;
}

export function AgentConsoleToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-toolbar", className)} {...props} />;
}

export function AgentConsoleTabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-tab-list", className)} {...props} />;
}

export function AgentConsoleTabButton({
  active = false,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
}) {
  return <Button size="sm" variant={active ? "solid" : "outline"} className={cn("agent-console-tab-button", className)} {...props} />;
}

export function AgentConsoleAgentList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-agent-list", className)} {...props} />;
}

export function AgentConsoleAgentListRow({
  active = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-active={active ? "true" : undefined}
      className={cn("agent-console-agent-list-row", className)}
      {...props}
    />
  );
}

export function AgentConsoleAgentSwitch({
  checked,
  className,
  ...props
}: ComponentProps<"button"> & {
  checked: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked ? "true" : undefined}
      className={cn("agent-console-agent-switch", className)}
      {...props}
    >
      <span className="agent-console-agent-switch__thumb" />
    </button>
  );
}

export function AgentConsoleSavedAt({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-saved-at", className)} {...props} />;
}
