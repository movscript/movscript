import { cloneElement, forwardRef, type ComponentProps, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Trash2, XCircle } from "lucide-react";

import { AsChildSlot, isSingleElementChild } from "../../../../lib/asChild";
import { cn } from "../../../../lib/cn";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "../../../../semantic";
import { AppInlineError, AppTextEmptyState } from "../../app";
import { AppPageShellBody } from "../../../layout";
import { ReviewCallout } from "../../review";
import {
  Badge,
  Button,
  Input,
  Label,
  NativeSelect,
  StatusBadge,
  type ButtonProps,
  type InputProps,
  type NativeSelectProps,
  type StatusBadgeProps,
} from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../surface-block";

export type AgentConsoleIssueTone = "action" | "warning" | "ready";

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

export function AgentConsoleMetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  tone: AgentConsoleIssueTone;
}) {
  const Icon = tone === "ready" ? CheckCircle2 : tone === "action" ? XCircle : AlertTriangle;
  const semanticTone = agentConsoleIssueTextTone(tone);
  const surfaceTone = agentConsoleIssueSurfaceTone(tone);
  return (
    <AgentConsoleToneSurfaceBlock variant="card" tone={surfaceTone} className="agent-console-metric-card">
      <div className="agent-console-metric-card__header">
        <p className="agent-console-metric-card__title">{title}</p>
        <Icon size={14} className={cn("agent-console-metric-card__icon", toneTextClass(semanticTone))} />
      </div>
      <p className="agent-console-metric-card__value" title={typeof value === "string" ? value : undefined}>{value}</p>
      <p className="agent-console-metric-card__detail" title={typeof detail === "string" ? detail : undefined}>{detail}</p>
    </AgentConsoleToneSurfaceBlock>
  );
}

export function AgentConsoleIssueSurfaceBlock({
  tone,
  className,
  ...props
}: Omit<AgentSurfaceBlockProps, "tone"> & {
  tone: Exclude<AgentConsoleIssueTone, "ready">;
}) {
  return (
    <AgentConsoleToneSurfaceBlock
      variant="subtle"
      tone={agentConsoleIssueSurfaceTone(tone)}
      className={cn("agent-console-issue-surface", className)}
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
  return <AppPageShellBody scroll="responsive-split" className={cn("agent-console-page-body", className)} {...props} />;
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
  columns?: "auto" | "two" | "three" | "server" | "identity" | "runtime" | "auth";
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
    <AgentSurfaceBlock asChild>
      <section className="agent-console-panel">
        <div className="agent-console-panel__header">
          <div className="agent-console-panel__title-row">
            {icon}
            <h2 className="agent-console-panel__title">{title}</h2>
          </div>
          {action}
        </div>
        <div className="agent-console-panel__body">{children}</div>
      </section>
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleInlineError({ className, ...props }: ComponentProps<typeof AppInlineError>) {
  return <AppInlineError className={cn("agent-console-inline-error", className)} {...props} />;
}

export function AgentConsoleLogSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-log-summary", className)} {...props} />;
}

export function AgentConsoleLogSummaryItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-log-summary__item", className)} {...props} />;
}

export function AgentConsoleLogSummaryLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-log-summary__label", className)} {...props} />;
}

export function AgentConsoleLogSummaryValue({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-log-summary__value", className)} {...props} />;
}

export const AgentConsoleLogStream = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("agent-console-log-stream", className)} {...props} />
);

AgentConsoleLogStream.displayName = "AgentConsoleLogStream";

export function AgentConsoleLogEmpty({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-log-empty", className)} {...props} />;
}

export function AgentConsoleLogLine({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-log-line", className)} {...props} />;
}

export function AgentConsoleLogLineTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-log-line__time", className)} {...props} />;
}

export function AgentConsoleLogLineStream({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-log-line__stream", className)} {...props} />;
}

export function AgentConsoleLogLineText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-log-line__text", className)} {...props} />;
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

export function AgentConsoleSavedAt({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-saved-at", className)} {...props} />;
}

export function AgentConsoleLocalToolCard({
  invalid = false,
  children,
}: {
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <AgentConsoleToneSurfaceBlock variant="subtle" tone={invalid ? "danger" : undefined} className="agent-console-local-tool-card">
      {children}
    </AgentConsoleToneSurfaceBlock>
  );
}

export function AgentConsoleLocalToolHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-card__header", className)} {...props} />;
}

export function AgentConsoleLocalToolCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__copy", className)} {...props} />;
}

export function AgentConsoleLocalToolTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__title", className)} {...props} />;
}

export function AgentConsoleLocalToolDetail({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__detail", className)} {...props} />;
}

export function AgentConsoleLocalToolControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-card__controls", className)} {...props} />;
}

export function AgentConsoleLocalToolFields({
  disabled = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
}) {
  return <div data-disabled={disabled ? "true" : undefined} className={cn("agent-console-local-tool-fields", className)} {...props} />;
}

export function AgentConsoleLocalToolActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-actions", className)} {...props} />;
}

export function AgentConsoleTestResult({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: SemanticTone;
}) {
  return <AgentConsoleToneText tone={tone} className={cn("agent-console-test-result", className)} {...props} />;
}

export function AgentConsoleFormField({
  label,
  className,
  ...props
}: InputProps & {
  label: ReactNode;
}) {
  return (
    <div className={cn("agent-console-form-field", className)}>
      <Label className="agent-console-form-field__label">{label}</Label>
      <Input controlSize="sm" className="agent-console-form-field__input" {...props} />
    </div>
  );
}

export function AgentConsoleSelectField({
  label,
  children,
  className,
  ...props
}: NativeSelectProps & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("agent-console-form-field", className)}>
      <Label className="agent-console-form-field__label">{label}</Label>
      <NativeSelect controlSize="sm" className="agent-console-form-field__input" {...props}>
        {children}
      </NativeSelect>
    </div>
  );
}

export function AgentConsoleRunSummaryLink({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AgentSurfaceBlock asChild variant="subtle">
      <AsChildSlot className="agent-console-run-summary-link">{children}</AsChildSlot>
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleRunSummaryHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-run-summary__header", className)} {...props} />;
}

export function AgentConsoleRunSummaryCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__copy", className)} {...props} />;
}

export function AgentConsoleRunSummaryId({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__id", className)} {...props} />;
}

export function AgentConsoleRunSummaryMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__meta", className)} {...props} />;
}

export function AgentConsoleRunSummaryDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-run-summary__detail", className)} {...props} />;
}

export function AgentConsoleIssueRowSurface({
  tone,
  title,
  detail,
  badge,
}: {
  tone: Exclude<AgentConsoleIssueTone, "ready">;
  title: ReactNode;
  detail: ReactNode;
  badge: ReactNode;
}) {
  return (
    <AgentConsoleIssueSurfaceBlock tone={tone} className="agent-console-issue-row">
      <div className="agent-console-issue-row__header">
        <p className="agent-console-issue-row__title">{title}</p>
        {badge}
      </div>
      <p className="agent-console-issue-row__detail">{detail}</p>
    </AgentConsoleIssueSurfaceBlock>
  );
}

export function AgentConsoleManagementLink({
  children,
  icon,
  title,
  detail,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  detail: ReactNode;
}) {
  const content = (
    <>
      <span className="agent-console-management-link__icon">{icon}</span>
      <span className="agent-console-management-link__copy">
        <span className="agent-console-management-link__title">{title}</span>
        <span className="agent-console-management-link__detail">{detail}</span>
      </span>
    </>
  );
  const child = isSingleElementChild(children)
    ? cloneElement(children as ReactElement<{ className?: string; children?: ReactNode }>, {
      className: cn((children as ReactElement<{ className?: string }>).props.className, "agent-console-management-link"),
      children: content,
    })
    : <div className="agent-console-management-link">{content}</div>;

  return (
    <AgentSurfaceBlock asChild variant="subtle">
      {child}
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleHistoryClearLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__layout", className)} {...props} />;
}

export function AgentConsoleHistoryClearBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__body", className)} {...props} />;
}

export function AgentConsoleHistoryClearTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-history-clear__title", className)} {...props} />;
}

export function AgentConsoleHistoryClearDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-history-clear__detail", className)} {...props} />;
}

export function AgentConsoleHistoryClearActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__actions", className)} {...props} />;
}

export function AgentConsoleInlineLink({ children }: { children: ReactNode }) {
  return <AsChildSlot className="agent-console-inline-link">{children}</AsChildSlot>;
}

function agentConsoleIssueTextTone(tone: AgentConsoleIssueTone): SemanticTone {
  if (tone === "ready") return "success";
  if (tone === "action") return "danger";
  return "warning";
}

function agentConsoleIssueSurfaceTone(tone: AgentConsoleIssueTone): SemanticTone | undefined {
  if (tone === "action") return "danger";
  if (tone === "warning") return "warning";
  return undefined;
}
