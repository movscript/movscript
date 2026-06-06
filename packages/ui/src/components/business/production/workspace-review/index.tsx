import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneTextClass } from "../../../../semantic";
import { Badge, Button, StatusBadge } from "../../../primitives";
import { AppCodeBlock, AppKeyValue, AppPanel, AppSurfaceItem, AppTextEmptyState } from "../../app";
import { ChangeActionBadge, ReviewCallout, ReviewDecisionBadge, ReviewWorkspaceShell, ReviewStat, type ChangeAction, type IconComponent, type ReviewTone } from "../../review";

export type ProductionWorkspaceReviewState =
  | "applied"
  | "backend_preview_ready"
  | "local_preview_ready"
  | "applying"
  | "simulating"
  | "empty"
  | "not_started"
  | "in_progress"
  | "blocked"
  | "ready_for_preview";

export interface ProductionWorkspaceReviewStatus {
  icon: IconComponent;
  iconClassName?: string;
  label: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  state: ProductionWorkspaceReviewState;
}

export interface ProductionWorkspaceReviewMetric {
  icon: IconComponent;
  label: ReactNode;
  value: ReactNode;
}

export interface ProductionWorkspaceApplyPreviewItem {
  key: string;
  action?: ChangeAction;
  title: ReactNode;
  kind: string;
  parent?: ReactNode;
  detail?: ReactNode;
}

export interface ProductionWorkspaceApplyPreview {
  writeTaskGraph: ProductionWorkspaceApplyPreviewItem[];
  blocked: ProductionWorkspaceApplyPreviewItem[];
  pending: ProductionWorkspaceApplyPreviewItem[];
  rejected: ProductionWorkspaceApplyPreviewItem[];
}

export type ProductionWorkspaceResultStatOutcome = "created" | "accepted" | "rejected" | "pending" | "neutral";

export interface ProductionWorkspaceResultStat {
  outcome?: ProductionWorkspaceResultStatOutcome;
  label: ReactNode;
  value?: ReactNode;
  showZero?: boolean;
}

export type ProductionWorkspaceApplyPreviewGroupState = "write" | "blocked" | "pending" | "rejected";

export interface ProductionWorkspaceBackendPreviewIssue {
  code?: ReactNode;
  message: ReactNode;
  detail?: ReactNode;
}

export interface ProductionWorkspaceBackendPreviewWarning {
  code: ReactNode;
  message: ReactNode;
}

export interface ProductionWorkspaceBackendPreviewChange {
  key?: string;
  kind: string;
  action?: ChangeAction;
  title: ReactNode;
}

export interface ProductionWorkspaceSemanticDiffSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export type ProductionWorkspaceSemanticDiffDecision = "accepted" | "rejected";
export type ProductionWorkspaceSemanticDiffGroupDecision = ProductionWorkspaceSemanticDiffDecision | "mixed";

export interface ProductionWorkspaceSemanticDiffFilterItem {
  value: string;
  label: ReactNode;
}

export function ProductionWorkspaceReviewSummary({
  summary,
  status,
  metrics,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  summary?: ReactNode;
  status: ProductionWorkspaceReviewStatus;
  metrics: ProductionWorkspaceReviewMetric[];
}) {
  return (
    <div className={cn("production-workspace-review-summary", className)}>
      {summary ? <p className="production-workspace-review-summary__text">{summary}</p> : null}
      <ProductionWorkspaceReviewStatusCard status={status} />
      <div className="production-workspace-review-metrics">
        {metrics.map((metric, index) => (
          <ProductionWorkspaceReviewMetricCard key={index} {...metric} />
        ))}
      </div>
    </div>
  );
}

export function ProductionWorkspaceReviewStatusCard({
  status,
}: {
  status: ProductionWorkspaceReviewStatus;
}) {
  const Icon = status.icon;
  const tone = productionWorkspaceReviewStateTone(status.state);
  return (
    <ReviewCallout tone={tone} className="production-workspace-review-status">
      <div className="production-workspace-review-status__header">
        <Icon size={14} className={cn("production-workspace-review-status__icon", status.iconClassName)} />
        <p className="production-workspace-review-status__label">{status.label}</p>
        <ReviewStat tone="neutral" className="production-workspace-review-status__title">{status.title}</ReviewStat>
      </div>
      <p className="production-workspace-review-status__detail">{status.detail}</p>
    </ReviewCallout>
  );
}

export function ProductionWorkspaceReviewMetricCard({
  icon: Icon,
  label,
  value,
}: ProductionWorkspaceReviewMetric) {
  return (
    <AppKeyValue
      label={(
        <span className="production-workspace-review-metric__label">
          <Icon size={12} />
          {label}
        </span>
      )}
      value={value}
      strong
    />
  );
}

export function ProductionWorkspaceReviewShell({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ReviewWorkspaceShell>) {
  return <ReviewWorkspaceShell className={cn("production-workspace-review-shell", className)} {...props} />;
}

export function ProductionWorkspaceReviewActionGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-workspace-review-action-group", className)} {...props} />;
}

export function ProductionWorkspaceReviewActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("production-workspace-review-action-button", className)} {...props} />;
}

export function ProductionWorkspaceReviewScrollArea({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-workspace-review-scroll-area", className)} {...props} />;
}

export function ProductionWorkspaceReviewContentStack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-workspace-review-content-stack", className)} {...props} />;
}

export function ProductionWorkspaceReviewErrorCallout({
  icon: Icon,
  message,
}: {
  icon?: IconComponent;
  message: ReactNode;
}) {
  return (
    <ReviewCallout tone="danger">
      <div className="production-workspace-review-error">
        {Icon ? <Icon size={14} className="production-workspace-review-error__icon" /> : null}
        <p className="production-workspace-review-error__message">{message}</p>
      </div>
    </ReviewCallout>
  );
}

export function ProductionWorkspaceResultStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-workspace-result-stack", className)}>{children}</div>;
}

export function ProductionWorkspaceResultStatGrid({
  stats,
  columns = 3,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  stats: ProductionWorkspaceResultStat[];
  columns?: 2 | 3;
}) {
  const visibleStats = stats.filter((stat) => stat.showZero || (stat.value !== 0 && stat.value !== "0" && stat.value !== null && stat.value !== undefined));
  if (visibleStats.length === 0) return null;
  return (
    <div className={cn("production-workspace-result-stat-grid", `production-workspace-result-stat-grid--${columns}`, className)}>
      {visibleStats.map((stat, index) => (
        <ReviewStat key={index} tone={productionWorkspaceResultStatTone(stat.outcome)}>
          {stat.label}{stat.value !== undefined ? ` ${stat.value}` : ""}
        </ReviewStat>
      ))}
    </div>
  );
}

export function ProductionWorkspaceResultCallout({
  icon,
  title,
  description,
  stats,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  stats?: ProductionWorkspaceResultStat[];
  children?: ReactNode;
}) {
  return (
    <ReviewCallout tone="success" icon={icon} title={title} className={className}>
      {description ? <p className="production-workspace-result-callout__description">{description}</p> : null}
      {stats ? <ProductionWorkspaceResultStatGrid stats={stats} columns={2} /> : null}
      {children}
    </ReviewCallout>
  );
}

export function ProductionWorkspaceBackendPreviewPanel({
  icon,
  iconClassName,
  title,
  badge,
  stats,
  children,
  className,
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: IconComponent;
  iconClassName?: string;
  title: ReactNode;
  badge?: ReactNode;
  stats: ProductionWorkspaceResultStat[];
  children?: ReactNode;
}) {
  return (
    <AppPanel
      icon={icon}
      iconClassName={iconClassName}
      title={title}
      action={badge}
      className={className}
    >
      <ProductionWorkspaceResultStatGrid stats={stats} columns={3} />
      {children}
    </AppPanel>
  );
}

export function ProductionWorkspaceResultActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("production-workspace-result-action-button", className)} {...props} />;
}

export function ProductionWorkspaceBackendPreviewReadyPanel({
  icon,
  title,
  stats,
  children,
  badge = "未写库",
}: {
  icon?: IconComponent;
  title: string;
  stats: ProductionWorkspaceResultStat[];
  children?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <ProductionWorkspaceBackendPreviewPanel
      icon={icon}
      iconClassName={toneTextClass("success")}
      title={title}
      badge={<Badge className="production-workspace-backend-preview-badge">{badge}</Badge>}
      stats={stats}
    >
      {children}
    </ProductionWorkspaceBackendPreviewPanel>
  );
}

export function ProductionWorkspaceContinueReviewPanel({
  icon,
  title,
  description,
  children,
}: {
  icon?: IconComponent;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppPanel icon={icon} iconClassName={toneTextClass("info")} title={title}>
      <p className="production-workspace-continue-review__description">{description}</p>
      <div className="production-workspace-continue-review__body">{children}</div>
    </AppPanel>
  );
}

export function ProductionWorkspaceBackendPreviewIssueCallout({
  issue,
  icon: Icon,
}: {
  issue: ProductionWorkspaceBackendPreviewIssue;
  icon?: IconComponent;
}) {
  return (
    <ReviewCallout tone="danger" className="production-workspace-backend-issue">
      {Icon ? <Icon size={14} className="production-workspace-backend-issue__icon" /> : null}
      <div className="production-workspace-backend-issue__body">
        <div className="production-workspace-backend-issue__header">
          <p className="production-workspace-backend-issue__title">后端预览未通过</p>
          {issue.code ? <ReviewStat tone="neutral" className="production-workspace-backend-issue__code">{issue.code}</ReviewStat> : null}
        </div>
        <p className="production-workspace-backend-issue__message">{issue.message}</p>
        {issue.detail ? (
          <AppSurfaceItem density="compact" variant="overlay" className="production-workspace-backend-issue__detail">
            <AppCodeBlock>{issue.detail}</AppCodeBlock>
          </AppSurfaceItem>
        ) : null}
        <p className="production-workspace-backend-issue__hint">请回到变更队列调整接受/拒绝决策，或重新生成缺少 ID 的复用/更新节点后再预览。</p>
      </div>
    </ReviewCallout>
  );
}

export function ProductionWorkspaceBackendPreviewSemanticSummary({
  changes,
  warnings,
  kindLabel = productionWorkspaceChangeKindLabel,
}: {
  changes: ProductionWorkspaceBackendPreviewChange[];
  warnings: ProductionWorkspaceBackendPreviewWarning[];
  kindLabel?: (kind: string) => ReactNode;
}) {
  if (changes.length === 0 && warnings.length === 0) return null;
  return (
    <div className="production-workspace-backend-summary">
      {warnings.length > 0 ? (
        <ReviewCallout tone="warning" compact>
          <div className="production-workspace-backend-summary__warning-header">
            <p className="production-workspace-backend-summary__warning-title">后端提示</p>
            <ReviewStat tone="neutral" className="production-workspace-backend-summary__warning-count">{warnings.length}</ReviewStat>
          </div>
          <div className="production-workspace-backend-summary__warning-list">
            {warnings.slice(0, 3).map((warning, index) => (
              <p key={index} className="production-workspace-backend-summary__warning">
                <span className="production-workspace-backend-summary__warning-code">{warning.code}</span>
                <span className="production-workspace-backend-summary__warning-message"> · {warning.message}</span>
              </p>
            ))}
            {warnings.length > 3 ? <p className="production-workspace-backend-summary__more">还有 {warnings.length - 3} 条提示未显示</p> : null}
          </div>
        </ReviewCallout>
      ) : null}
      {changes.length > 0 ? (
        <AppPanel title="后端 Diff" action={<ReviewStat tone="neutral">{changes.length}</ReviewStat>} bodyClassName="production-workspace-backend-summary__change-list">
          {changes.slice(0, 6).map((change, index) => (
            <AppSurfaceItem key={change.key ?? `${change.kind}-${index}`} density="compact" variant="overlay" className="production-workspace-backend-summary__change">
              <ChangeActionBadge action={change.action} compact />
              <span className="production-workspace-backend-summary__change-title">{change.title}</span>
              <span className="production-workspace-backend-summary__change-kind">{kindLabel(change.kind)}</span>
            </AppSurfaceItem>
          ))}
          {changes.length > 6 ? <p className="production-workspace-backend-summary__more">还有 {changes.length - 6} 项未显示</p> : null}
        </AppPanel>
      ) : null}
    </div>
  );
}

export function ProductionWorkspaceResultActions({
  previewOnly,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  previewOnly: boolean;
  children: ReactNode;
}) {
  return <div className={cn("production-workspace-result-actions", previewOnly && "production-workspace-result-actions--single", className)}>{children}</div>;
}

export function ProductionWorkspaceSemanticDiffStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-workspace-semantic-diff", className)}>{children}</div>;
}

export function ProductionWorkspaceSemanticDiffEmptyText({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("production-workspace-semantic-diff__empty", className)} {...props} />;
}

export function ProductionWorkspaceSemanticDiffOverview({
  icon,
  title = "草案审阅",
  filteredCount,
  totalCount,
  summary,
  children,
}: {
  icon?: IconComponent;
  title?: ReactNode;
  filteredCount: number;
  totalCount: number;
  summary: ProductionWorkspaceSemanticDiffSummary;
  children?: ReactNode;
}) {
  return (
    <AppPanel
      icon={icon}
      title={title}
      action={<ReviewStat tone="neutral">{filteredCount}/{totalCount} 段</ReviewStat>}
    >
      <div className="production-workspace-semantic-diff__summary">
        <ReviewStat tone="neutral">总计 {summary.total}</ReviewStat>
        <ReviewStat tone="neutral">未审 {summary.pending}</ReviewStat>
        <ReviewStat tone="success">接受 {summary.accepted}</ReviewStat>
        <ReviewStat tone="danger">拒绝 {summary.rejected}</ReviewStat>
      </div>
      {children ? <div className="production-workspace-semantic-diff__filters">{children}</div> : null}
    </AppPanel>
  );
}

export function ProductionWorkspaceSemanticDiffFilterRow({
  items,
  value,
  onChange,
}: {
  items: ProductionWorkspaceSemanticDiffFilterItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="production-workspace-semantic-diff-filter-row">
      {items.map((item) => (
        <Button
          key={item.value}
          type="button"
          size="xs"
          variant={value === item.value ? "solid" : "soft"}
          onClick={() => onChange(item.value)}
          className="production-workspace-semantic-diff-filter-row__button"
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export function ProductionWorkspaceSemanticDiffGroupCard({
  action,
  title,
  detail,
  decision,
  stats,
  children,
  onAcceptVisible,
  onRejectVisible,
}: {
  action?: ChangeAction;
  title: ReactNode;
  detail?: ReactNode;
  decision?: ProductionWorkspaceSemanticDiffGroupDecision;
  stats: ReactNode[];
  children: ReactNode;
  onAcceptVisible: () => void;
  onRejectVisible: () => void;
}) {
  return (
    <AppPanel className={cn(decision === "rejected" && "production-workspace-semantic-diff-group--rejected")} bodyClassName="production-workspace-semantic-diff-group__body">
      <div className="production-workspace-semantic-diff-group__header">
        <div className="production-workspace-semantic-diff-group__header-row">
          <ChangeActionBadge action={action} />
          <div className="production-workspace-semantic-diff-group__main">
            <div className="production-workspace-semantic-diff-group__title-row">
              <p className="production-workspace-semantic-diff-group__title">{title}</p>
              {decision && decision !== "mixed" ? <ReviewDecisionBadge decision={decision} /> : null}
              {decision === "mixed" ? <ReviewStat tone="neutral">部分处理</ReviewStat> : null}
            </div>
            {detail ? <p className="production-workspace-semantic-diff-group__detail">{detail}</p> : null}
            <div className="production-workspace-semantic-diff-group__stats">
              {stats.map((stat, index) => (
                <ReviewStat key={index} tone="neutral">{stat}</ReviewStat>
              ))}
            </div>
          </div>
        </div>
        <div className="production-workspace-semantic-diff-group__actions">
          <Button size="xs" variant={decision === "accepted" ? "soft" : "outline"} className="production-workspace-semantic-diff__action-button" onClick={onAcceptVisible}>
            接受可见项
          </Button>
          <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-workspace-semantic-diff__action-button" onClick={onRejectVisible}>
            拒绝可见项
          </Button>
        </div>
      </div>
      {children}
    </AppPanel>
  );
}

export function ProductionWorkspaceSemanticDiffRow({
  icon: Icon,
  action,
  title,
  detail,
  before,
  after,
  decision,
  blocked,
  blockedLabel = "回上游工作台",
  acceptTitle,
  onAccept,
  onReject,
}: {
  icon: IconComponent;
  action?: ChangeAction;
  title: ReactNode;
  detail?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  decision?: ProductionWorkspaceSemanticDiffDecision;
  blocked?: boolean;
  blockedLabel?: ReactNode;
  acceptTitle?: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={cn("production-workspace-semantic-diff-row", changeActionClass(action), decision === "rejected" && "production-workspace-semantic-diff-row--rejected")}>
      <div className="production-workspace-semantic-diff-row__content">
        <Icon size={12} className="production-workspace-semantic-diff-row__icon" />
        <ChangeActionBadge action={action} compact />
        <div className="production-workspace-semantic-diff-row__main">
          <div className="production-workspace-semantic-diff-row__title-row">
            <p className="production-workspace-semantic-diff-row__title">{title}</p>
            {decision ? <ReviewDecisionBadge decision={decision} /> : null}
            {!decision && blocked ? <StatusBadge intent="warning" emphasis="soft" className="production-workspace-semantic-diff-row__blocked">{blockedLabel}</StatusBadge> : null}
          </div>
          {detail ? <p className="production-workspace-semantic-diff-row__detail">{detail}</p> : null}
          {before || after ? (
            <div className="production-workspace-semantic-diff-row__values">
              {before ? <StatusBadge intent="danger" emphasis="soft" className="production-workspace-semantic-diff-row__value">原：{before}</StatusBadge> : null}
              {after ? <StatusBadge intent="success" emphasis="soft" className="production-workspace-semantic-diff-row__value">新：{after}</StatusBadge> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="production-workspace-semantic-diff-row__actions">
        <Button
          size="xs"
          variant={decision === "accepted" ? "soft" : "outline"}
          className="production-workspace-semantic-diff__action-button"
          onClick={onAccept}
          disabled={blocked}
          title={acceptTitle}
        >
          {blocked ? blockedLabel : "接受"}
        </Button>
        <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-workspace-semantic-diff__action-button" onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  );
}

export function ProductionWorkspaceContextStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-workspace-context-stack", className)}>{children}</div>;
}

export function ProductionWorkspaceContextGroup({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: IconComponent;
  title: ReactNode;
  count: number;
  empty: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AppPanel
      icon={icon}
      title={title}
      action={<ReviewStat tone="neutral">{count}</ReviewStat>}
      bodyClassName={cn(count > 0 && "production-workspace-context-group__body")}
    >
      {count === 0 ? (
        <p className="production-workspace-context-group__empty">{empty}</p>
      ) : children}
    </AppPanel>
  );
}

export function ProductionWorkspaceContextItemRow({
  action,
  title,
  parent,
  detail,
  decision,
  onAccept,
  onReject,
}: {
  action?: ChangeAction;
  title: ReactNode;
  parent: ReactNode;
  detail?: ReactNode;
  decision?: ProductionWorkspaceSemanticDiffDecision;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={cn("production-workspace-context-item", decision === "rejected" && "production-workspace-context-item--rejected")}>
      <div className="production-workspace-context-item__content">
        <ChangeActionBadge action={action} compact />
        <div className="production-workspace-context-item__main">
          <div className="production-workspace-context-item__title-row">
            <p className="production-workspace-context-item__title">{title}</p>
            {decision ? <ReviewDecisionBadge decision={decision} /> : null}
          </div>
          <p className="production-workspace-context-item__parent">{parent}</p>
          {detail ? <p className="production-workspace-context-item__detail">{detail}</p> : null}
        </div>
      </div>
      <div className="production-workspace-context-item__actions">
        <Button size="xs" variant={decision === "accepted" ? "soft" : "outline"} className="production-workspace-semantic-diff__action-button" onClick={onAccept}>
          接受
        </Button>
        <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-workspace-semantic-diff__action-button" onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  );
}

export function ProductionWorkspaceApplyPreviewPanel({
  preview,
  kindLabel = productionWorkspaceApplyPreviewKindLabel,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  preview: ProductionWorkspaceApplyPreview;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <div className={cn("production-workspace-apply-preview", className)}>
      <ProductionWorkspaceApplyPreviewGroup
        state="write"
        title="将写入"
        items={preview.writeTaskGraph}
        empty="还没有接受任何可写入项"
        kindLabel={kindLabel}
      />
      <ProductionWorkspaceApplyPreviewGroup
        state="blocked"
        title="依赖未接受"
        items={preview.blocked}
        empty="没有被父级决策阻塞的已接受项"
        kindLabel={kindLabel}
      />
      <ProductionWorkspaceApplyPreviewGroup
        state="pending"
        title="未处理"
        items={preview.pending}
        empty="没有未审项"
        kindLabel={kindLabel}
      />
      <ProductionWorkspaceApplyPreviewGroup
        state="rejected"
        title="已拒绝"
        items={preview.rejected}
        empty="没有拒绝项"
        kindLabel={kindLabel}
      />
    </div>
  );
}

export function ProductionWorkspaceApplyPreviewGroup({
  title,
  items,
  empty,
  state,
  kindLabel = productionWorkspaceApplyPreviewKindLabel,
}: {
  title: ReactNode;
  items: ProductionWorkspaceApplyPreviewItem[];
  empty: ReactNode;
  state: ProductionWorkspaceApplyPreviewGroupState;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <ReviewCallout tone={productionWorkspaceApplyPreviewGroupTone(state)} className="production-workspace-apply-preview-group">
      <div className="production-workspace-apply-preview-group__header">
        <p className="production-workspace-apply-preview-group__title">{title}</p>
        <ReviewStat tone="neutral" className="production-workspace-apply-preview-group__count">{items.length}</ReviewStat>
      </div>
      {items.length === 0 ? (
        <p className="production-workspace-apply-preview-group__empty">{empty}</p>
      ) : (
        <div className="production-workspace-apply-preview-group__list">
          {items.slice(0, 8).map((item) => (
            <ProductionWorkspaceApplyPreviewItemRow key={item.key} item={item} kindLabel={kindLabel} />
          ))}
          {items.length > 8 ? <p className="production-workspace-apply-preview-group__more">还有 {items.length - 8} 项未显示</p> : null}
        </div>
      )}
    </ReviewCallout>
  );
}

export function ProductionWorkspaceApplyPreviewItemRow({
  item,
  kindLabel = productionWorkspaceApplyPreviewKindLabel,
}: {
  item: ProductionWorkspaceApplyPreviewItem;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <AppSurfaceItem density="compact" variant="overlay" className="production-workspace-apply-preview-item">
      <div className="production-workspace-apply-preview-item__header">
        <ChangeActionBadge action={item.action} compact />
        <span className="production-workspace-apply-preview-item__title">{item.title}</span>
        <span className="production-workspace-apply-preview-item__kind">{kindLabel(item.kind)}</span>
      </div>
      {item.parent ? <p className="production-workspace-apply-preview-item__parent">{item.parent}</p> : null}
      {item.detail ? <p className="production-workspace-apply-preview-item__detail">{item.detail}</p> : null}
    </AppSurfaceItem>
  );
}

function productionWorkspaceReviewStateTone(state: ProductionWorkspaceReviewState): ReviewTone {
  if (state === "applied" || state === "backend_preview_ready" || state === "local_preview_ready" || state === "ready_for_preview") return "success";
  if (state === "applying" || state === "simulating" || state === "not_started" || state === "in_progress") return "warning";
  if (state === "blocked") return "danger";
  return "neutral";
}

function productionWorkspaceResultStatTone(outcome: ProductionWorkspaceResultStatOutcome = "neutral"): ReviewTone {
  if (outcome === "created" || outcome === "accepted") return "success";
  if (outcome === "rejected") return "danger";
  return "neutral";
}

function productionWorkspaceApplyPreviewGroupTone(state: ProductionWorkspaceApplyPreviewGroupState): ReviewTone {
  if (state === "write") return "success";
  if (state === "blocked") return "warning";
  if (state === "rejected") return "danger";
  return "neutral";
}

export function productionWorkspaceApplyPreviewKindLabel(kind: string) {
  if (kind === "segment") return "编排段";
  if (kind === "scene_moment") return "情节";
  if (kind === "writing_expression") return "表达";
  if (kind === "content_unit") return "内容";
  if (kind === "keyframe") return "画面锚点";
  if (kind === "setting") return "设定";
  return "素材";
}

export function productionWorkspaceChangeKindLabel(kind: string) {
  if (kind === "segment") return "编排段";
  if (kind === "scene_moment") return "情节";
  if (kind === "writing_expression") return "表达";
  if (kind === "content_unit") return "内容";
  if (kind === "keyframe") return "画面锚点";
  if (kind === "setting") return "设定";
  if (kind === "asset_slot") return "素材";
  return kind;
}

function changeActionClass(action?: ChangeAction) {
  if (action === "update") return "production-workspace-semantic-diff-row--update";
  if (action === "delete") return "production-workspace-semantic-diff-row--delete";
  return "production-workspace-semantic-diff-row--create";
}
