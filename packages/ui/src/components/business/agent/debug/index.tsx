import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { AsChildSlot } from "../../../../lib/asChild";
import { cn } from "../../../../lib/cn";
import { toneSurfaceClass, toneTextClass } from "../../../../semantic";
import { AppCodeBlock, AppInlineMeta, AppKeyValue, AppMetricCard, AppPanel, AppStateMessage, AppTextEmptyState } from "../../app";
import {
  Badge,
  Button,
  CheckIcon,
  NativeSelect,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  Textarea,
  type ButtonProps,
  type StatusBadgeProps,
  XIcon,
} from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { ReviewCallout } from "../../review";
import { AgentDataBlock } from "../run";
import { AgentSurfaceBlock } from "../surface-block";

export type AgentDebugSeverity = "ready" | "action" | "warning" | "info";
export type AgentDebugTone = "neutral" | "info" | "success" | "warning" | "danger";
export type AgentDebugWorkspaceDiffSide = "current" | "proposed";
export type AgentDebugWorkspaceDiffLineChange = "removed" | "added" | "same";

export function AgentDebugHeaderContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-header", className)} {...props} />;
}

export function AgentDebugHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-header__copy", className)} {...props} />;
}

export function AgentDebugHeaderTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-header__title-row", className)} {...props} />;
}

export function AgentDebugHeaderTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-debug-header__title", className)} {...props} />;
}

export function AgentDebugHeaderDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-debug-header__description", className)} {...props} />;
}

export function AgentDebugHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-header__actions", className)} {...props} />;
}

export function AgentDebugScopeRail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-scope-rail", className)} {...props} />;
}

export function AgentDebugActionButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="sm" className={cn("agent-debug-action-button", className)} {...props} />;
}

export function AgentDebugIcon({
  icon: Icon,
  spinning = false,
  selected = false,
  className,
  ...props
}: ComponentProps<IconComponent> & {
  icon: IconComponent;
  spinning?: boolean;
  selected?: boolean;
}) {
  return (
    <Icon
      className={cn(
        "agent-debug-icon",
        spinning ? "agent-debug-icon--spinning" : undefined,
        selected ? "agent-debug-icon--selected" : undefined,
        className,
      )}
      {...props}
    />
  );
}

export function AgentDebugBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn("agent-debug-badge", className)} {...props} />;
}

export function AgentDebugStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-debug-status-badge", className)} {...props} />;
}

export function AgentDebugTabs({ className, ...props }: ComponentProps<typeof Tabs>) {
  return <Tabs className={cn("agent-debug-tabs", className)} {...props} />;
}

export function AgentDebugTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return <TabsList className={cn("agent-debug-tabs-list", className)} {...props} />;
}

export function AgentDebugTabsContent({
  layout = "stack",
  className,
  ...props
}: ComponentProps<typeof TabsContent> & {
  layout?: "stack" | "two" | "overview" | "tool-console" | "workspace-runtime" | "metrics";
}) {
  return <TabsContent data-layout={layout} className={cn("agent-debug-tabs-content", className)} {...props} />;
}

export function AgentDebugStack({
  density = "regular",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "compact" | "regular";
}) {
  return <div data-density={density} className={cn("agent-debug-stack", className)} {...props} />;
}

export function AgentDebugGrid({
  columns = "two",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "two" | "three" | "four" | "runtime" | "overview";
}) {
  return <div data-columns={columns} className={cn("agent-debug-grid", className)} {...props} />;
}

export function AgentDebugActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-action-row", className)} {...props} />;
}

export function AgentDebugFormField({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("agent-debug-form-field", className)} {...props} />;
}

export function AgentDebugFieldLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-debug-field-label", className)} {...props} />;
}

export function AgentDebugNativeSelect({ className, ...props }: ComponentProps<typeof NativeSelect>) {
  return <NativeSelect className={cn("agent-debug-native-select", className)} {...props} />;
}

export function AgentDebugTextarea({
  minRows = "default",
  monospace = false,
  className,
  ...props
}: ComponentProps<typeof Textarea> & {
  minRows?: "default" | "large" | "console" | "tall";
  monospace?: boolean;
}) {
  return (
    <Textarea
      data-min-rows={minRows}
      data-monospace={monospace ? "true" : undefined}
      className={cn("agent-debug-textarea", className)}
      {...props}
    />
  );
}

export function AgentDebugCodeBlock({ className, ...props }: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("agent-debug-code-block", className)} {...props} />;
}

export function AgentDebugItemTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-debug-item-title", className)} {...props} />;
}

export function AgentDebugItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-debug-item-detail", className)} {...props} />;
}

export function AgentDebugIssueList({
  items,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLUListElement>, "children"> & {
  items: ReactNode[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("agent-debug-issue-list", className)} {...props}>
      {items.map((item, index) => (
        <li key={index} className="agent-debug-issue-list__item">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function AgentDebugDialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-overlay", className)} {...props} />;
}

export function AgentDebugDialogSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AgentSurfaceBlock asChild className={cn("agent-debug-dialog-surface", className)}>
      <div {...props} />
    </AgentSurfaceBlock>
  );
}

export function AgentDebugDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-header", className)} {...props} />;
}

export function AgentDebugDialogHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-header__copy", className)} {...props} />;
}

export function AgentDebugDialogTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-title-row", className)} {...props} />;
}

export function AgentDebugDialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("agent-debug-dialog-title", className)} {...props} />;
}

export function AgentDebugDialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-debug-dialog-description", className)} {...props} />;
}

export function AgentDebugDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-body", className)} {...props} />;
}

export function AgentDebugDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-footer", className)} {...props} />;
}

export function AgentDebugDialogFooterActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-dialog-footer__actions", className)} {...props} />;
}

export function AgentDebugSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="agent-debug-section">
      <h3 className="agent-debug-section__title">{title}</h3>
      {children}
    </section>
  );
}

export function AgentDebugSummaryItem({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <AgentDataBlock className="agent-debug-summary-item">
      <span className="agent-debug-summary-item__label">{label}</span>
      <span className="agent-debug-summary-item__value" title={typeof value === "string" ? value : undefined}>{value}</span>
    </AgentDataBlock>
  );
}

export function AgentDebugCodePanel({
  children,
  size = "medium",
  span,
  className,
}: {
  children: ReactNode;
  size?: "small" | "medium" | "large" | "raw";
  span?: "full";
  className?: string;
}) {
  return (
    <AgentDataBlock data-size={size} data-span={span} className={cn("agent-debug-code-panel", className)}>
      <AppCodeBlock className="agent-debug-code-panel__code">{children}</AppCodeBlock>
    </AgentDataBlock>
  );
}

export function AgentDebugFieldCodePanel({
  label,
  children,
  size = "small",
  span,
}: {
  label: ReactNode;
  children: ReactNode;
  size?: "small" | "medium" | "large" | "raw";
  span?: "full";
}) {
  return (
    <div data-span={span} className="agent-debug-field-group">
      <span className="agent-debug-field-group__label">{label}</span>
      <AgentDebugCodePanel span={span} size={size} className="agent-debug-field-code-panel">
        {children}
      </AgentDebugCodePanel>
    </div>
  );
}

export function AgentDebugLabeledCodePanel({
  leading,
  trailing,
  children,
  size = "medium",
}: {
  leading: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  size?: "small" | "medium" | "large" | "raw";
}) {
  return (
    <AgentDataBlock data-size={size} className="agent-debug-labeled-code-panel">
      <div className="agent-debug-labeled-code-panel__header">
        <div className="agent-debug-labeled-code-panel__leading">{leading}</div>
        {trailing ? <span className="agent-debug-labeled-code-panel__trailing">{trailing}</span> : null}
      </div>
      <AgentDebugCodeBlock className="agent-debug-labeled-code-panel__code">
        {children}
      </AgentDebugCodeBlock>
    </AgentDataBlock>
  );
}

export function AgentDebugSimpleText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-simple-text", className)} {...props} />;
}

export function AgentDebugSubtleText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-subtle-text", className)} {...props} />;
}

export function AgentDebugMetaList({
  items,
  empty,
}: {
  items: ReactNode[];
  empty?: ReactNode;
}) {
  if (items.length === 0) {
    return <AgentDebugSubtleText>{empty}</AgentDebugSubtleText>;
  }
  return (
    <div className="agent-debug-meta-list">
      {items.map((item, index) => (
        <div key={index} className="agent-debug-meta-list__item">{item}</div>
      ))}
    </div>
  );
}

export function AgentDebugCard({
  variant = "subtle",
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant={variant} className={cn("agent-debug-card", className)} {...props} />;
}

export function AgentDebugCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-card__header", className)} {...props} />;
}

export function AgentDebugCardTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-debug-card__title", className)} {...props} />;
}

export function AgentDebugCardDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-debug-card__detail", className)} {...props} />;
}

export function AgentDebugHttpRequestShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AgentSurfaceBlock asChild className={cn("agent-debug-http-request", className)}>
      <div {...props} />
    </AgentSurfaceBlock>
  );
}

export function AgentDebugHttpRequestHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-http-request__header", className)} {...props} />;
}

export function AgentDebugHttpRequestTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-debug-http-request__title", className)} {...props} />;
}

export function AgentDebugHttpRequestBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-http-request__body", className)} {...props} />;
}

export function AgentDebugHttpRequestUrl({
  method,
  url,
}: {
  method: ReactNode;
  url: ReactNode;
}) {
  return (
    <AgentDataBlock className="agent-debug-http-request__url">
      <span className="agent-debug-http-request__method">{method}</span>{" "}
      <span className="agent-debug-http-request__url-text">{url}</span>
    </AgentDataBlock>
  );
}

export function AgentDebugFieldGroup({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="agent-debug-field-group">
      <span className="agent-debug-field-group__label">{label}</span>
      {children}
    </div>
  );
}

export function AgentDebugWorkspaceDiffShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AgentSurfaceBlock asChild className={cn("agent-debug-workspace-diff", className)}>
      <div {...props} />
    </AgentSurfaceBlock>
  );
}

export function AgentDebugWorkspaceDiffHeader({
  currentLabel,
  proposedLabel,
}: {
  currentLabel: ReactNode;
  proposedLabel: ReactNode;
}) {
  return (
    <div className="agent-debug-workspace-diff__header">
      <span className="agent-debug-workspace-diff__header-cell agent-debug-workspace-diff__header-cell--current">{currentLabel}</span>
      <span className="agent-debug-workspace-diff__header-cell">{proposedLabel}</span>
    </div>
  );
}

export function AgentDebugWorkspaceDiffColumns({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-debug-workspace-diff__columns", className)} {...props} />;
}

export function AgentDebugWorkspaceDiffRows({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("agent-debug-workspace-diff__rows", className)}>
      <AgentSurfaceBlock className="agent-debug-workspace-diff__rows-inner" {...props} />
    </div>
  );
}

export function AgentDebugInlineLink({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
}) {
  if (asChild) {
    return <AsChildSlot className={cn("agent-debug-inline-link", className)} {...props} />;
  }
  return <a className={cn("agent-debug-inline-link", className)} {...props} />;
}

export function AgentDebugBlockLink({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLAnchorElement> & {
  asChild?: boolean;
}) {
  if (asChild) {
    return <AsChildSlot className={cn("agent-debug-block-link", className)} {...props} />;
  }
  return <a className={cn("agent-debug-block-link", className)} {...props} />;
}

export function AgentDebugStatusRow({
  icon,
  title,
  detail,
  secondaryDetail,
  status,
  statusProps,
  actions,
  className,
  ...props
}: ComponentProps<typeof AgentDataBlock> & {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  secondaryDetail?: ReactNode;
  status?: ReactNode;
  statusProps?: StatusBadgeProps;
  actions?: ReactNode;
}) {
  return (
    <AgentDataBlock className={cn("agent-debug-status-row", className)} {...props}>
      <span className="agent-debug-status-row__body">
        {icon ? <span className="agent-debug-status-row__icon">{icon}</span> : null}
        <span className="agent-debug-status-row__copy">
          <span className="agent-debug-status-row__title">{title}</span>
          {detail ? <span className="agent-debug-status-row__detail">{detail}</span> : null}
          {secondaryDetail ? <span className="agent-debug-status-row__detail">{secondaryDetail}</span> : null}
        </span>
      </span>
      <span className="agent-debug-status-row__trailing">
        {status ? (
          <StatusBadge {...statusProps} className={cn("agent-debug-status-row__badge", statusProps?.className)}>
            {status}
          </StatusBadge>
        ) : null}
        {actions}
      </span>
    </AgentDataBlock>
  );
}

export function AgentDebugPanel({
  icon,
  title,
  children,
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  icon?: IconComponent;
  title?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppPanel
      icon={icon}
      title={title}
      className={cn("agent-debug-panel", className)}
      bodyClassName={cn("agent-debug-panel__body", bodyClassName)}
      {...props}
    >
      {children}
    </AppPanel>
  );
}

export function AgentDebugListRow({
  title,
  meta,
  description,
  trailing,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <AgentDataBlock className={cn("agent-debug-list-row", className)}>
      <div className="agent-debug-list-row__copy">
        <p className="agent-debug-list-row__title">{title}</p>
        {meta ? <p className="agent-debug-list-row__meta">{meta}</p> : null}
        {description ? <p className="agent-debug-list-row__description">{description}</p> : null}
      </div>
      {trailing ? <div className="agent-debug-list-row__trailing">{trailing}</div> : null}
    </AgentDataBlock>
  );
}

export function AgentDebugInlineMeta({
  className,
  ...props
}: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn("agent-debug-inline-meta", className)} {...props} />;
}

export function AgentDebugPreviewBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn("agent-debug-preview-badge", className)} {...props} />;
}

export function AgentDebugPreviewStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-debug-preview-status-badge", className)} {...props} />;
}

export function AgentDebugPreviewActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("agent-debug-preview-action-button", className)} {...props} />;
}

export function AgentDebugStateMessage({
  className,
  ...props
}: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn("agent-debug-state-message", className)} {...props} />;
}

export function AgentDebugMetricCard({
  compact = true,
  ...props
}: ComponentProps<typeof AppMetricCard>) {
  return <AppMetricCard compact={compact} {...props} />;
}

export function AgentDebugKeyValue({
  className,
  ...props
}: ComponentProps<typeof AppKeyValue>) {
  return <AppKeyValue className={cn("agent-debug-key-value", className)} {...props} />;
}

export function AgentDebugCallout({
  className,
  ...props
}: ComponentProps<typeof ReviewCallout>) {
  return <ReviewCallout className={cn("agent-debug-callout", className)} {...props} />;
}

export function AgentDebugWarningCallout({
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, "tone" | "compact">) {
  return <ReviewCallout tone="warning" compact className={cn("agent-debug-callout agent-debug-warning-callout", className)} {...props} />;
}

export function AgentDebugErrorCallout({
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, "tone" | "compact">) {
  return <ReviewCallout tone="danger" compact className={cn("agent-debug-callout agent-debug-error-callout", className)} {...props} />;
}

export function AgentDebugToneText({
  as: Element = "p",
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div";
  tone: Exclude<AgentDebugTone, "neutral">;
}) {
  return (
    <Element className={cn("agent-debug-tone-text", toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  );
}

export function AgentDebugWorkspaceDiffCodeBlock({
  side,
  className,
  ...props
}: ComponentProps<typeof AppCodeBlock> & {
  side: AgentDebugWorkspaceDiffSide;
}) {
  const tone = side === "current" ? "danger" : "success";
  return (
    <AppCodeBlock
      className={cn("agent-debug-workspace-diff-code", `agent-debug-workspace-diff-code--${side}`, toneSurfaceClass(tone), toneTextClass(tone), className)}
      {...props}
    />
  );
}

export function AgentDebugWorkspaceDiffLine({
  change,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  change: AgentDebugWorkspaceDiffLineChange;
}) {
  const tone = change === "removed" ? "danger" : change === "added" ? "success" : undefined;
  return (
    <div
      className={cn(
        "agent-debug-workspace-diff-line",
        `agent-debug-workspace-diff-line--${change}`,
        tone ? cn(toneSurfaceClass(tone), toneTextClass(tone)) : undefined,
        className,
      )}
      {...props}
    />
  );
}

export function AgentDebugStatusIcon({
  status,
  className,
  size = 14,
}: {
  status: Exclude<AgentDebugSeverity, "info">;
  className?: string;
  size?: number;
}) {
  if (status === "ready") {
    return <CheckIcon size={size} className={cn("agent-debug-status-icon", toneTextClass("success"), className)} />;
  }
  return (
    <XIcon
      size={size}
      className={cn("agent-debug-status-icon", toneTextClass(status === "action" ? "danger" : "warning"), className)}
    />
  );
}

export function AgentDebugSeverityBlock({
  severity,
  className,
  ...props
}: ComponentProps<typeof AgentDataBlock> & {
  severity?: "action" | "warning" | "info";
}) {
  return (
    <AgentDataBlock
      className={cn(
        "agent-debug-severity-block",
        severity === "action" ? toneSurfaceClass("danger") : severity === "warning" ? toneSurfaceClass("warning") : undefined,
        className,
      )}
      {...props}
    />
  );
}

export function AgentDebugRunListRow({
  id,
  meta,
  description,
  status,
  statusProps,
  className,
}: {
  id: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  status: ReactNode;
  statusProps?: StatusBadgeProps;
  className?: string;
}) {
  return (
    <AgentDebugListRow
      title={id}
      meta={meta}
      description={description}
      className={cn("agent-debug-run-list-row", className)}
      trailing={(
        <StatusBadge {...statusProps} className={cn("agent-debug-run-list-row__status", statusProps?.className)}>
          {status}
        </StatusBadge>
      )}
    />
  );
}

export function AgentDebugJsonPanel({
  icon,
  title,
  code,
  value,
  formatValue = defaultFormatDebugValue,
  emptyText = "-",
}: {
  icon?: IconComponent;
  title: ReactNode;
  code?: ReactNode;
  value?: unknown;
  formatValue?: (value: unknown) => ReactNode;
  emptyText?: ReactNode;
}) {
  const resolvedCode = code ?? (value === undefined || value === null ? undefined : formatValue(value));

  return (
    <AgentDebugPanel icon={icon} title={title}>
      {resolvedCode === undefined || resolvedCode === null ? (
        <AgentDebugEmptyText>{emptyText}</AgentDebugEmptyText>
      ) : (
        <AgentDataBlock className="agent-debug-json-panel__code">
          <AppCodeBlock>{resolvedCode}</AppCodeBlock>
        </AgentDataBlock>
      )}
    </AgentDebugPanel>
  );
}

export function AgentDebugEmptyText({ children }: { children: ReactNode }) {
  return <AppTextEmptyState className="agent-debug-empty-text">{children}</AppTextEmptyState>;
}

function defaultFormatDebugValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
