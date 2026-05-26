import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneTextClass } from "../../../../semantic";
import { Badge, Button, StatusBadge } from "../../../primitives";
import { AppCodeBlock, AppKeyValue, AppPanel, AppSurfaceItem, AppTextEmptyState } from "../../app";
import { ChangeActionBadge, ReviewCallout, ReviewDecisionBadge, ReviewProposalShell, ReviewStat, type ChangeAction, type IconComponent, type ReviewTone } from "../../review";

export type ProductionProposalReviewState =
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

export interface ProductionProposalReviewStatus {
  icon: IconComponent;
  iconClassName?: string;
  label: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  state: ProductionProposalReviewState;
}

export interface ProductionProposalReviewMetric {
  icon: IconComponent;
  label: ReactNode;
  value: ReactNode;
}

export interface ProductionProposalApplyPreviewItem {
  key: string;
  action?: ChangeAction;
  title: ReactNode;
  kind: string;
  parent?: ReactNode;
  detail?: ReactNode;
}

export interface ProductionProposalApplyPreview {
  writeTaskGraph: ProductionProposalApplyPreviewItem[];
  blocked: ProductionProposalApplyPreviewItem[];
  pending: ProductionProposalApplyPreviewItem[];
  rejected: ProductionProposalApplyPreviewItem[];
}

export type ProductionProposalResultStatOutcome = "created" | "accepted" | "rejected" | "pending" | "neutral";

export interface ProductionProposalResultStat {
  outcome?: ProductionProposalResultStatOutcome;
  label: ReactNode;
  value?: ReactNode;
  showZero?: boolean;
}

export type ProductionProposalApplyPreviewGroupState = "write" | "blocked" | "pending" | "rejected";

export interface ProductionProposalBackendPreviewIssue {
  code?: ReactNode;
  message: ReactNode;
  detail?: ReactNode;
}

export interface ProductionProposalBackendPreviewWarning {
  code: ReactNode;
  message: ReactNode;
}

export interface ProductionProposalBackendPreviewChange {
  key?: string;
  kind: string;
  action?: ChangeAction;
  title: ReactNode;
}

export interface ProductionProposalSemanticDiffSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export type ProductionProposalSemanticDiffDecision = "accepted" | "rejected";
export type ProductionProposalSemanticDiffGroupDecision = ProductionProposalSemanticDiffDecision | "mixed";

export interface ProductionProposalSemanticDiffFilterItem {
  value: string;
  label: ReactNode;
}

export function ProductionProposalReviewSummary({
  summary,
  status,
  metrics,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  summary?: ReactNode;
  status: ProductionProposalReviewStatus;
  metrics: ProductionProposalReviewMetric[];
}) {
  return (
    <div className={cn("production-proposal-review-summary", className)}>
      {summary ? <p className="production-proposal-review-summary__text">{summary}</p> : null}
      <ProductionProposalReviewStatusCard status={status} />
      <div className="production-proposal-review-metrics">
        {metrics.map((metric, index) => (
          <ProductionProposalReviewMetricCard key={index} {...metric} />
        ))}
      </div>
    </div>
  );
}

export function ProductionProposalReviewStatusCard({
  status,
}: {
  status: ProductionProposalReviewStatus;
}) {
  const Icon = status.icon;
  const tone = productionProposalReviewStateTone(status.state);
  return (
    <ReviewCallout tone={tone} className="production-proposal-review-status">
      <div className="production-proposal-review-status__header">
        <Icon size={14} className={cn("production-proposal-review-status__icon", status.iconClassName)} />
        <p className="production-proposal-review-status__label">{status.label}</p>
        <ReviewStat tone="neutral" className="production-proposal-review-status__title">{status.title}</ReviewStat>
      </div>
      <p className="production-proposal-review-status__detail">{status.detail}</p>
    </ReviewCallout>
  );
}

export function ProductionProposalReviewMetricCard({
  icon: Icon,
  label,
  value,
}: ProductionProposalReviewMetric) {
  return (
    <AppKeyValue
      label={(
        <span className="production-proposal-review-metric__label">
          <Icon size={12} />
          {label}
        </span>
      )}
      value={value}
      strong
    />
  );
}

export function ProductionProposalReviewShell({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ReviewProposalShell>) {
  return <ReviewProposalShell className={cn("production-proposal-review-shell", className)} {...props} />;
}

export function ProductionProposalReviewActionGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-proposal-review-action-group", className)} {...props} />;
}

export function ProductionProposalReviewActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("production-proposal-review-action-button", className)} {...props} />;
}

export function ProductionProposalReviewScrollArea({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-proposal-review-scroll-area", className)} {...props} />;
}

export function ProductionProposalReviewContentStack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("production-proposal-review-content-stack", className)} {...props} />;
}

export function ProductionProposalReviewErrorCallout({
  icon: Icon,
  message,
}: {
  icon?: IconComponent;
  message: ReactNode;
}) {
  return (
    <ReviewCallout tone="danger">
      <div className="production-proposal-review-error">
        {Icon ? <Icon size={14} className="production-proposal-review-error__icon" /> : null}
        <p className="production-proposal-review-error__message">{message}</p>
      </div>
    </ReviewCallout>
  );
}

export function ProductionProposalResultStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-proposal-result-stack", className)}>{children}</div>;
}

export function ProductionProposalResultStatGrid({
  stats,
  columns = 3,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  stats: ProductionProposalResultStat[];
  columns?: 2 | 3;
}) {
  const visibleStats = stats.filter((stat) => stat.showZero || (stat.value !== 0 && stat.value !== "0" && stat.value !== null && stat.value !== undefined));
  if (visibleStats.length === 0) return null;
  return (
    <div className={cn("production-proposal-result-stat-grid", `production-proposal-result-stat-grid--${columns}`, className)}>
      {visibleStats.map((stat, index) => (
        <ReviewStat key={index} tone={productionProposalResultStatTone(stat.outcome)}>
          {stat.label}{stat.value !== undefined ? ` ${stat.value}` : ""}
        </ReviewStat>
      ))}
    </div>
  );
}

export function ProductionProposalResultCallout({
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
  stats?: ProductionProposalResultStat[];
  children?: ReactNode;
}) {
  return (
    <ReviewCallout tone="success" icon={icon} title={title} className={className}>
      {description ? <p className="production-proposal-result-callout__description">{description}</p> : null}
      {stats ? <ProductionProposalResultStatGrid stats={stats} columns={2} /> : null}
      {children}
    </ReviewCallout>
  );
}

export function ProductionProposalBackendPreviewPanel({
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
  stats: ProductionProposalResultStat[];
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
      <ProductionProposalResultStatGrid stats={stats} columns={3} />
      {children}
    </AppPanel>
  );
}

export function ProductionProposalResultActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("production-proposal-result-action-button", className)} {...props} />;
}

export function ProductionProposalBackendPreviewReadyPanel({
  icon,
  title,
  stats,
  children,
  badge = "未写库",
}: {
  icon?: IconComponent;
  title: string;
  stats: ProductionProposalResultStat[];
  children?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <ProductionProposalBackendPreviewPanel
      icon={icon}
      iconClassName={toneTextClass("success")}
      title={title}
      badge={<Badge className="production-proposal-backend-preview-badge">{badge}</Badge>}
      stats={stats}
    >
      {children}
    </ProductionProposalBackendPreviewPanel>
  );
}

export function ProductionProposalContinueReviewPanel({
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
      <p className="production-proposal-continue-review__description">{description}</p>
      <div className="production-proposal-continue-review__body">{children}</div>
    </AppPanel>
  );
}

export function ProductionProposalBackendPreviewIssueCallout({
  issue,
  icon: Icon,
}: {
  issue: ProductionProposalBackendPreviewIssue;
  icon?: IconComponent;
}) {
  return (
    <ReviewCallout tone="danger" className="production-proposal-backend-issue">
      {Icon ? <Icon size={14} className="production-proposal-backend-issue__icon" /> : null}
      <div className="production-proposal-backend-issue__body">
        <div className="production-proposal-backend-issue__header">
          <p className="production-proposal-backend-issue__title">后端预览未通过</p>
          {issue.code ? <ReviewStat tone="neutral" className="production-proposal-backend-issue__code">{issue.code}</ReviewStat> : null}
        </div>
        <p className="production-proposal-backend-issue__message">{issue.message}</p>
        {issue.detail ? (
          <AppSurfaceItem density="compact" variant="overlay" className="production-proposal-backend-issue__detail">
            <AppCodeBlock>{issue.detail}</AppCodeBlock>
          </AppSurfaceItem>
        ) : null}
        <p className="production-proposal-backend-issue__hint">请回到变更队列调整接受/拒绝决策，或重新生成缺少 ID 的复用/更新节点后再预览。</p>
      </div>
    </ReviewCallout>
  );
}

export function ProductionProposalBackendPreviewSemanticSummary({
  changes,
  warnings,
  kindLabel = productionProposalChangeKindLabel,
}: {
  changes: ProductionProposalBackendPreviewChange[];
  warnings: ProductionProposalBackendPreviewWarning[];
  kindLabel?: (kind: string) => ReactNode;
}) {
  if (changes.length === 0 && warnings.length === 0) return null;
  return (
    <div className="production-proposal-backend-summary">
      {warnings.length > 0 ? (
        <ReviewCallout tone="warning" compact>
          <div className="production-proposal-backend-summary__warning-header">
            <p className="production-proposal-backend-summary__warning-title">后端提示</p>
            <ReviewStat tone="neutral" className="production-proposal-backend-summary__warning-count">{warnings.length}</ReviewStat>
          </div>
          <div className="production-proposal-backend-summary__warning-list">
            {warnings.slice(0, 3).map((warning, index) => (
              <p key={index} className="production-proposal-backend-summary__warning">
                <span className="production-proposal-backend-summary__warning-code">{warning.code}</span>
                <span className="production-proposal-backend-summary__warning-message"> · {warning.message}</span>
              </p>
            ))}
            {warnings.length > 3 ? <p className="production-proposal-backend-summary__more">还有 {warnings.length - 3} 条提示未显示</p> : null}
          </div>
        </ReviewCallout>
      ) : null}
      {changes.length > 0 ? (
        <AppPanel title="后端 Diff" action={<ReviewStat tone="neutral">{changes.length}</ReviewStat>} bodyClassName="production-proposal-backend-summary__change-list">
          {changes.slice(0, 6).map((change, index) => (
            <AppSurfaceItem key={change.key ?? `${change.kind}-${index}`} density="compact" variant="overlay" className="production-proposal-backend-summary__change">
              <ChangeActionBadge action={change.action} compact />
              <span className="production-proposal-backend-summary__change-title">{change.title}</span>
              <span className="production-proposal-backend-summary__change-kind">{kindLabel(change.kind)}</span>
            </AppSurfaceItem>
          ))}
          {changes.length > 6 ? <p className="production-proposal-backend-summary__more">还有 {changes.length - 6} 项未显示</p> : null}
        </AppPanel>
      ) : null}
    </div>
  );
}

export function ProductionProposalResultActions({
  previewOnly,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  previewOnly: boolean;
  children: ReactNode;
}) {
  return <div className={cn("production-proposal-result-actions", previewOnly && "production-proposal-result-actions--single", className)}>{children}</div>;
}

export function ProductionProposalSemanticDiffStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-proposal-semantic-diff", className)}>{children}</div>;
}

export function ProductionProposalSemanticDiffEmptyText({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <AppTextEmptyState className={cn("production-proposal-semantic-diff__empty", className)} {...props} />;
}

export function ProductionProposalSemanticDiffOverview({
  icon,
  title = "提案审阅",
  filteredCount,
  totalCount,
  summary,
  children,
}: {
  icon?: IconComponent;
  title?: ReactNode;
  filteredCount: number;
  totalCount: number;
  summary: ProductionProposalSemanticDiffSummary;
  children?: ReactNode;
}) {
  return (
    <AppPanel
      icon={icon}
      title={title}
      action={<ReviewStat tone="neutral">{filteredCount}/{totalCount} 段</ReviewStat>}
    >
      <div className="production-proposal-semantic-diff__summary">
        <ReviewStat tone="neutral">总计 {summary.total}</ReviewStat>
        <ReviewStat tone="neutral">未审 {summary.pending}</ReviewStat>
        <ReviewStat tone="success">接受 {summary.accepted}</ReviewStat>
        <ReviewStat tone="danger">拒绝 {summary.rejected}</ReviewStat>
      </div>
      {children ? <div className="production-proposal-semantic-diff__filters">{children}</div> : null}
    </AppPanel>
  );
}

export function ProductionProposalSemanticDiffFilterRow({
  items,
  value,
  onChange,
}: {
  items: ProductionProposalSemanticDiffFilterItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="production-proposal-semantic-diff-filter-row">
      {items.map((item) => (
        <Button
          key={item.value}
          type="button"
          size="xs"
          variant={value === item.value ? "solid" : "soft"}
          onClick={() => onChange(item.value)}
          className="production-proposal-semantic-diff-filter-row__button"
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export function ProductionProposalSemanticDiffGroupCard({
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
  decision?: ProductionProposalSemanticDiffGroupDecision;
  stats: ReactNode[];
  children: ReactNode;
  onAcceptVisible: () => void;
  onRejectVisible: () => void;
}) {
  return (
    <AppPanel className={cn(decision === "rejected" && "production-proposal-semantic-diff-group--rejected")} bodyClassName="production-proposal-semantic-diff-group__body">
      <div className="production-proposal-semantic-diff-group__header">
        <div className="production-proposal-semantic-diff-group__header-row">
          <ChangeActionBadge action={action} />
          <div className="production-proposal-semantic-diff-group__main">
            <div className="production-proposal-semantic-diff-group__title-row">
              <p className="production-proposal-semantic-diff-group__title">{title}</p>
              {decision && decision !== "mixed" ? <ReviewDecisionBadge decision={decision} /> : null}
              {decision === "mixed" ? <ReviewStat tone="neutral">部分处理</ReviewStat> : null}
            </div>
            {detail ? <p className="production-proposal-semantic-diff-group__detail">{detail}</p> : null}
            <div className="production-proposal-semantic-diff-group__stats">
              {stats.map((stat, index) => (
                <ReviewStat key={index} tone="neutral">{stat}</ReviewStat>
              ))}
            </div>
          </div>
        </div>
        <div className="production-proposal-semantic-diff-group__actions">
          <Button size="xs" variant={decision === "accepted" ? "soft" : "outline"} className="production-proposal-semantic-diff__action-button" onClick={onAcceptVisible}>
            接受可见项
          </Button>
          <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-proposal-semantic-diff__action-button" onClick={onRejectVisible}>
            拒绝可见项
          </Button>
        </div>
      </div>
      {children}
    </AppPanel>
  );
}

export function ProductionProposalSemanticDiffRow({
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
  decision?: ProductionProposalSemanticDiffDecision;
  blocked?: boolean;
  blockedLabel?: ReactNode;
  acceptTitle?: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={cn("production-proposal-semantic-diff-row", changeActionClass(action), decision === "rejected" && "production-proposal-semantic-diff-row--rejected")}>
      <div className="production-proposal-semantic-diff-row__content">
        <Icon size={12} className="production-proposal-semantic-diff-row__icon" />
        <ChangeActionBadge action={action} compact />
        <div className="production-proposal-semantic-diff-row__main">
          <div className="production-proposal-semantic-diff-row__title-row">
            <p className="production-proposal-semantic-diff-row__title">{title}</p>
            {decision ? <ReviewDecisionBadge decision={decision} /> : null}
            {!decision && blocked ? <StatusBadge intent="warning" emphasis="soft" className="production-proposal-semantic-diff-row__blocked">{blockedLabel}</StatusBadge> : null}
          </div>
          {detail ? <p className="production-proposal-semantic-diff-row__detail">{detail}</p> : null}
          {before || after ? (
            <div className="production-proposal-semantic-diff-row__values">
              {before ? <StatusBadge intent="danger" emphasis="soft" className="production-proposal-semantic-diff-row__value">原：{before}</StatusBadge> : null}
              {after ? <StatusBadge intent="success" emphasis="soft" className="production-proposal-semantic-diff-row__value">新：{after}</StatusBadge> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="production-proposal-semantic-diff-row__actions">
        <Button
          size="xs"
          variant={decision === "accepted" ? "soft" : "outline"}
          className="production-proposal-semantic-diff__action-button"
          onClick={onAccept}
          disabled={blocked}
          title={acceptTitle}
        >
          {blocked ? blockedLabel : "接受"}
        </Button>
        <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-proposal-semantic-diff__action-button" onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  );
}

export function ProductionProposalContextStack({
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return <div className={cn("production-proposal-context-stack", className)}>{children}</div>;
}

export function ProductionProposalContextGroup({
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
      bodyClassName={cn(count > 0 && "production-proposal-context-group__body")}
    >
      {count === 0 ? (
        <p className="production-proposal-context-group__empty">{empty}</p>
      ) : children}
    </AppPanel>
  );
}

export function ProductionProposalContextItemRow({
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
  decision?: ProductionProposalSemanticDiffDecision;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={cn("production-proposal-context-item", decision === "rejected" && "production-proposal-context-item--rejected")}>
      <div className="production-proposal-context-item__content">
        <ChangeActionBadge action={action} compact />
        <div className="production-proposal-context-item__main">
          <div className="production-proposal-context-item__title-row">
            <p className="production-proposal-context-item__title">{title}</p>
            {decision ? <ReviewDecisionBadge decision={decision} /> : null}
          </div>
          <p className="production-proposal-context-item__parent">{parent}</p>
          {detail ? <p className="production-proposal-context-item__detail">{detail}</p> : null}
        </div>
      </div>
      <div className="production-proposal-context-item__actions">
        <Button size="xs" variant={decision === "accepted" ? "soft" : "outline"} className="production-proposal-semantic-diff__action-button" onClick={onAccept}>
          接受
        </Button>
        <Button size="xs" variant={decision === "rejected" ? "soft" : "ghost"} className="production-proposal-semantic-diff__action-button" onClick={onReject}>
          拒绝
        </Button>
      </div>
    </div>
  );
}

export function ProductionProposalApplyPreviewPanel({
  preview,
  kindLabel = productionProposalApplyPreviewKindLabel,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  preview: ProductionProposalApplyPreview;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <div className={cn("production-proposal-apply-preview", className)}>
      <ProductionProposalApplyPreviewGroup
        state="write"
        title="将写入"
        items={preview.writeTaskGraph}
        empty="还没有接受任何可写入项"
        kindLabel={kindLabel}
      />
      <ProductionProposalApplyPreviewGroup
        state="blocked"
        title="依赖未接受"
        items={preview.blocked}
        empty="没有被父级决策阻塞的已接受项"
        kindLabel={kindLabel}
      />
      <ProductionProposalApplyPreviewGroup
        state="pending"
        title="未处理"
        items={preview.pending}
        empty="没有未审项"
        kindLabel={kindLabel}
      />
      <ProductionProposalApplyPreviewGroup
        state="rejected"
        title="已拒绝"
        items={preview.rejected}
        empty="没有拒绝项"
        kindLabel={kindLabel}
      />
    </div>
  );
}

export function ProductionProposalApplyPreviewGroup({
  title,
  items,
  empty,
  state,
  kindLabel = productionProposalApplyPreviewKindLabel,
}: {
  title: ReactNode;
  items: ProductionProposalApplyPreviewItem[];
  empty: ReactNode;
  state: ProductionProposalApplyPreviewGroupState;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <ReviewCallout tone={productionProposalApplyPreviewGroupTone(state)} className="production-proposal-apply-preview-group">
      <div className="production-proposal-apply-preview-group__header">
        <p className="production-proposal-apply-preview-group__title">{title}</p>
        <ReviewStat tone="neutral" className="production-proposal-apply-preview-group__count">{items.length}</ReviewStat>
      </div>
      {items.length === 0 ? (
        <p className="production-proposal-apply-preview-group__empty">{empty}</p>
      ) : (
        <div className="production-proposal-apply-preview-group__list">
          {items.slice(0, 8).map((item) => (
            <ProductionProposalApplyPreviewItemRow key={item.key} item={item} kindLabel={kindLabel} />
          ))}
          {items.length > 8 ? <p className="production-proposal-apply-preview-group__more">还有 {items.length - 8} 项未显示</p> : null}
        </div>
      )}
    </ReviewCallout>
  );
}

export function ProductionProposalApplyPreviewItemRow({
  item,
  kindLabel = productionProposalApplyPreviewKindLabel,
}: {
  item: ProductionProposalApplyPreviewItem;
  kindLabel?: (kind: string) => ReactNode;
}) {
  return (
    <AppSurfaceItem density="compact" variant="overlay" className="production-proposal-apply-preview-item">
      <div className="production-proposal-apply-preview-item__header">
        <ChangeActionBadge action={item.action} compact />
        <span className="production-proposal-apply-preview-item__title">{item.title}</span>
        <span className="production-proposal-apply-preview-item__kind">{kindLabel(item.kind)}</span>
      </div>
      {item.parent ? <p className="production-proposal-apply-preview-item__parent">{item.parent}</p> : null}
      {item.detail ? <p className="production-proposal-apply-preview-item__detail">{item.detail}</p> : null}
    </AppSurfaceItem>
  );
}

function productionProposalReviewStateTone(state: ProductionProposalReviewState): ReviewTone {
  if (state === "applied" || state === "backend_preview_ready" || state === "local_preview_ready" || state === "ready_for_preview") return "success";
  if (state === "applying" || state === "simulating" || state === "not_started" || state === "in_progress") return "warning";
  if (state === "blocked") return "danger";
  return "neutral";
}

function productionProposalResultStatTone(outcome: ProductionProposalResultStatOutcome = "neutral"): ReviewTone {
  if (outcome === "created" || outcome === "accepted") return "success";
  if (outcome === "rejected") return "danger";
  return "neutral";
}

function productionProposalApplyPreviewGroupTone(state: ProductionProposalApplyPreviewGroupState): ReviewTone {
  if (state === "write") return "success";
  if (state === "blocked") return "warning";
  if (state === "rejected") return "danger";
  return "neutral";
}

export function productionProposalApplyPreviewKindLabel(kind: string) {
  if (kind === "segment") return "编排段";
  if (kind === "scene_moment") return "情节";
  if (kind === "writing_expression") return "表达";
  if (kind === "content_unit") return "内容";
  if (kind === "keyframe") return "画面锚点";
  if (kind === "creative_reference") return "设定";
  return "素材";
}

export function productionProposalChangeKindLabel(kind: string) {
  if (kind === "segment") return "编排段";
  if (kind === "scene_moment") return "情节";
  if (kind === "writing_expression") return "表达";
  if (kind === "content_unit") return "内容";
  if (kind === "keyframe") return "画面锚点";
  if (kind === "creative_reference") return "设定";
  if (kind === "asset_slot") return "素材";
  return kind;
}

function changeActionClass(action?: ChangeAction) {
  if (action === "update") return "production-proposal-semantic-diff-row--update";
  if (action === "delete") return "production-proposal-semantic-diff-row--delete";
  return "production-proposal-semantic-diff-row--create";
}
