import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Pencil,
  Plus,
  X,
} from "lucide-react";

import { AppInlineMeta, AppSurfaceItem, AppTextEmptyState } from "../../../app";
import { ReviewCallout, ReviewWorkspaceShell } from "../../../review";
import { WorkbenchList, WorkbenchListItem } from "../../../workbench";
import { Badge, Button, StatusBadge } from "../../../../primitives";

export type ContentWorkbenchReviewQueueState = "empty" | "needs_review" | "pending_review" | "processed";
export type ContentWorkbenchReviewDiffState = "added" | "changed" | "unchanged" | "planned";
export type ContentWorkbenchReviewDiffKind = "content_unit" | "keyframe";

export interface ContentWorkbenchReviewWorkspace {
  id: string;
  title: string;
  status?: string;
}

export interface ContentWorkbenchReviewQueueSummary {
  total: number;
  pending: number;
  warningCount: number;
  addedCount: number;
  changedCount: number;
  state: ContentWorkbenchReviewQueueState;
  title: string;
  detail: string;
  actionLabel: string;
}

export interface ContentWorkbenchReviewFieldDiff {
  label: string;
  before?: string;
  after?: string;
}

export interface ContentWorkbenchReviewDiff {
  key: string;
  state: ContentWorkbenchReviewDiffState;
  kind: ContentWorkbenchReviewDiffKind;
  title: string;
  target: string;
  detail?: string;
  impact: string;
  before?: string;
  after?: string;
  fields: ContentWorkbenchReviewFieldDiff[];
  currentUnitId?: number;
  workspace?: Record<string, unknown>;
}

export interface ContentWorkbenchReviewModel {
  summary: string;
  targetLabel: string;
  diffs: ContentWorkbenchReviewDiff[];
  warnings: string[];
  stats: Array<{ label: string; value: number }>;
}

export interface ContentWorkbenchReviewPanelProps<Workspace extends ContentWorkbenchReviewWorkspace = ContentWorkbenchReviewWorkspace> {
  reviewMode: boolean;
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  reviewModel: ContentWorkbenchReviewModel | null;
  queueSummary: ContentWorkbenchReviewQueueSummary;
  rejectingWorkspace: boolean;
  markingWorkspaceReviewed: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateUnitFromWorkspace: (workspace: Record<string, unknown>) => void;
  onEditCurrentUnit: (unitId: number) => void;
  onApplyUnitWorkspace: (unitId: number, workspace: Record<string, unknown>) => void;
  onMarkWorkspaceReviewed: (workspace: Workspace) => void;
  onRejectWorkspace: (workspace: Workspace) => void;
  onCloseReview: () => void;
}

export function ContentWorkbenchReviewPanel<Workspace extends ContentWorkbenchReviewWorkspace>({
  reviewMode,
  workspaces,
  selectedWorkspace,
  reviewModel,
  queueSummary,
  rejectingWorkspace,
  markingWorkspaceReviewed,
  onSelectWorkspace,
  onCreateUnitFromWorkspace,
  onEditCurrentUnit,
  onApplyUnitWorkspace,
  onMarkWorkspaceReviewed,
  onRejectWorkspace,
  onCloseReview,
}: ContentWorkbenchReviewPanelProps<Workspace>) {
  return (
    <ReviewWorkspaceShell
      kind="content_unit_workspace"
      title="AI 审稿队列"
      icon={ClipboardCheck}
      description="审阅内容编排草案，对制作项和关键帧快照执行创建、编辑、确认或退回。"
      action={(
        <div className="content-workbench-review-panel__shell-action">
          <StatusBadge intent={contentWorkbenchReviewQueueIntent(queueSummary.state)}>
            {queueSummary.pending > 0 ? `${queueSummary.pending} 待审` : `${queueSummary.total} 草案`}
          </StatusBadge>
          <Button size="sm" variant="outline" className="content-workbench-review-panel__icon-button" onClick={onCloseReview}>
            <Database size={14} />
            {reviewMode ? "退出审阅" : "收起审阅"}
          </Button>
        </div>
      )}
    >
      <ContentWorkbenchReviewQueueCard
        queueSummary={queueSummary}
      />

      {workspaces.length === 0 ? (
        <AppTextEmptyState>
          暂无待审制作项草案。
        </AppTextEmptyState>
      ) : (
        <div className="content-workbench-review-panel__layout">
          <WorkbenchList>
            {workspaces.map((workspace) => (
              <ContentWorkbenchReviewWorkspaceListItem
                key={workspace.id}
                workspace={workspace}
                active={selectedWorkspace?.id === workspace.id}
                onSelectWorkspace={onSelectWorkspace}
              />
            ))}
          </WorkbenchList>

          <AppSurfaceItem density="compact" className="content-workbench-review-panel__detail">
            {!selectedWorkspace || !reviewModel ? (
              <AppTextEmptyState>选择一个草案后查看快照对比。</AppTextEmptyState>
            ) : (
              <ContentWorkbenchReviewWorkspaceDetail
                workspace={selectedWorkspace}
                reviewModel={reviewModel}
                rejectingWorkspace={rejectingWorkspace}
                markingWorkspaceReviewed={markingWorkspaceReviewed}
                onCreateUnitFromWorkspace={onCreateUnitFromWorkspace}
                onEditCurrentUnit={onEditCurrentUnit}
                onApplyUnitWorkspace={onApplyUnitWorkspace}
                onMarkWorkspaceReviewed={onMarkWorkspaceReviewed}
                onRejectWorkspace={onRejectWorkspace}
              />
            )}
          </AppSurfaceItem>
        </div>
      )}
    </ReviewWorkspaceShell>
  );
}

function ContentWorkbenchReviewQueueCard({
  queueSummary,
}: {
  queueSummary: ContentWorkbenchReviewQueueSummary;
}) {
  return (
    <AppSurfaceItem
      density="compact"
      className="content-workbench-review-queue"
      data-state={queueSummary.state}
      data-testid="content-workbench-review-queue"
    >
      <div className="content-workbench-review-queue__header">
        <div className="content-workbench-review-queue__copy">
          <div className="content-workbench-review-queue__title">
            <Bot size={14} className="content-workbench-review-queue__icon" />
            {queueSummary.title}
          </div>
          <p className="content-workbench-review-queue__detail">{queueSummary.detail}</p>
        </div>
      </div>
      {queueSummary.total > 0 ? (
        <ContentWorkbenchReviewMetrics queueSummary={queueSummary} />
      ) : null}
    </AppSurfaceItem>
  );
}

function ContentWorkbenchReviewMetrics({
  queueSummary,
}: {
  queueSummary: ContentWorkbenchReviewQueueSummary;
}) {
  return (
    <div className="content-workbench-review-metrics" data-testid="content-workbench-review-metrics">
      <ContentWorkbenchReviewMetricItem tone={queueSummary.pending > 0 ? "warning" : undefined}>
        {queueSummary.pending} 待审
      </ContentWorkbenchReviewMetricItem>
      <span className="content-workbench-review-metrics__separator">/</span>
      <span>{queueSummary.addedCount} 新增</span>
      <span className="content-workbench-review-metrics__separator">/</span>
      <ContentWorkbenchReviewMetricItem tone={queueSummary.changedCount > 0 ? "warning" : undefined}>
        {queueSummary.changedCount} 变更
      </ContentWorkbenchReviewMetricItem>
      <span className="content-workbench-review-metrics__separator">/</span>
      <ContentWorkbenchReviewMetricItem tone={queueSummary.warningCount > 0 ? "warning" : undefined}>
        {queueSummary.warningCount} 风险
      </ContentWorkbenchReviewMetricItem>
    </div>
  );
}

function ContentWorkbenchReviewMetricItem({
  tone,
  children,
}: {
  tone?: "warning";
  children: ReactNode;
}) {
  return (
    <span className="content-workbench-review-metrics__item" data-tone={tone}>
      {children}
    </span>
  );
}

function ContentWorkbenchReviewWorkspaceListItem<Workspace extends ContentWorkbenchReviewWorkspace>({
  workspace,
  active,
  onSelectWorkspace,
}: {
  workspace: Workspace;
  active: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
}) {
  return (
    <WorkbenchListItem
      active={active}
      density="compact"
      onClick={() => onSelectWorkspace(workspace.id)}
      className="content-workbench-review-workspace-list-item"
    >
      <div className="content-workbench-review-workspace-list-item__body">
        <div className="content-workbench-review-workspace-list-item__copy">
          <p className="content-workbench-review-workspace-list-item__title">{workspace.title}</p>
          <p className="content-workbench-review-workspace-list-item__detail">制作项草案</p>
        </div>
        <Badge variant={active ? "soft" : "outline"} className="content-workbench-review-workspace-list-item__badge">
          结构
        </Badge>
      </div>
    </WorkbenchListItem>
  );
}

function ContentWorkbenchReviewWorkspaceDetail<Workspace extends ContentWorkbenchReviewWorkspace>({
  workspace,
  reviewModel,
  rejectingWorkspace,
  markingWorkspaceReviewed,
  onCreateUnitFromWorkspace,
  onEditCurrentUnit,
  onApplyUnitWorkspace,
  onMarkWorkspaceReviewed,
  onRejectWorkspace,
}: {
  workspace: Workspace;
  reviewModel: ContentWorkbenchReviewModel;
  rejectingWorkspace: boolean;
  markingWorkspaceReviewed: boolean;
  onCreateUnitFromWorkspace: (workspace: Record<string, unknown>) => void;
  onEditCurrentUnit: (unitId: number) => void;
  onApplyUnitWorkspace: (unitId: number, workspace: Record<string, unknown>) => void;
  onMarkWorkspaceReviewed: (workspace: Workspace) => void;
  onRejectWorkspace: (workspace: Workspace) => void;
}) {
  return (
    <div className="content-workbench-review-detail">
      <div className="content-workbench-review-detail__header">
        <div className="content-workbench-review-detail__copy">
          <div className="content-workbench-review-detail__title-row">
            <h3 className="content-workbench-review-detail__title">{workspace.title}</h3>
            <Badge className="content-workbench-review-detail__badge">制作项快照</Badge>
          </div>
          <p className="content-workbench-review-detail__summary">
            {reviewModel.targetLabel} · {reviewModel.summary}
          </p>
        </div>
        <div className="content-workbench-review-detail__stats">
          {reviewModel.stats.map((stat) => (
            <Badge key={stat.label} variant="outline" className="content-workbench-review-detail__stat">
              {stat.label} {stat.value}
            </Badge>
          ))}
        </div>
      </div>
      <AppSurfaceItem density="compact" className="content-workbench-review-manual-note">
        <p className="content-workbench-review-manual-note__text">
          内容编排草案当前只做 snapshot 审阅；按差异创建、编辑或确认无需写入后，可标记为人工已处理，或退回草案清理待审队列。
        </p>
        <div className="content-workbench-review-manual-note__actions">
          <Button
            size="sm"
            className="content-workbench-review-panel__icon-button"
            data-testid="content-workbench-mark-workspace-reviewed"
            onClick={() => onMarkWorkspaceReviewed(workspace)}
            loading={markingWorkspaceReviewed}
            disabled={markingWorkspaceReviewed || workspace.status === "applied"}
          >
            <CheckCircle2 size={14} />
            {workspace.status === "applied" ? "已处理" : "标记人工已处理"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="content-workbench-review-panel__icon-button"
            onClick={() => onRejectWorkspace(workspace)}
            loading={rejectingWorkspace}
            disabled={rejectingWorkspace || workspace.status === "rejected"}
          >
            <X size={14} />
            退回草案
          </Button>
        </div>
      </AppSurfaceItem>

      {reviewModel.warnings.length > 0 ? (
        <ReviewCallout tone="warning" compact>
          {reviewModel.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </ReviewCallout>
      ) : null}

      <div className="content-workbench-review-diff-list">
        {reviewModel.diffs.map((change) => (
          <ContentWorkbenchReviewDiffCard
            key={change.key}
            change={change}
            onCreateUnitFromWorkspace={onCreateUnitFromWorkspace}
            onEditCurrentUnit={onEditCurrentUnit}
            onApplyUnitWorkspace={onApplyUnitWorkspace}
          />
        ))}
      </div>
    </div>
  );
}

function ContentWorkbenchReviewDiffCard({
  change,
  onCreateUnitFromWorkspace,
  onEditCurrentUnit,
  onApplyUnitWorkspace,
}: {
  change: ContentWorkbenchReviewDiff;
  onCreateUnitFromWorkspace: (workspace: Record<string, unknown>) => void;
  onEditCurrentUnit: (unitId: number) => void;
  onApplyUnitWorkspace: (unitId: number, workspace: Record<string, unknown>) => void;
}) {
  return (
    <AppSurfaceItem density="compact" variant="muted" className="content-workbench-review-diff-card">
      <div className="content-workbench-review-diff-card__header">
        <div className="content-workbench-review-diff-card__copy">
          <div className="content-workbench-review-diff-card__title-row">
            <Badge variant={change.state === "added" ? "soft" : change.state === "unchanged" ? "outline" : "soft"} className="content-workbench-review-diff-card__badge">
              {contentSnapshotStateLabel(change.state)}
            </Badge>
            <Badge variant="outline" className="content-workbench-review-diff-card__badge">
              {contentSnapshotKindLabel(change.kind)}
            </Badge>
            <span className="content-workbench-review-diff-card__title">{change.title}</span>
          </div>
          <p className="content-workbench-review-diff-card__target">{change.target}</p>
        </div>
        <p className="content-workbench-review-diff-card__impact">{change.impact}</p>
      </div>
      {change.detail ? <p className="content-workbench-review-diff-card__detail">{change.detail}</p> : null}
      {change.state === "added" && change.workspace ? (
        <Button
          size="sm"
          variant="outline"
          className="content-workbench-review-diff-card__action"
          data-testid="content-workbench-create-workspace-unit"
          onClick={() => onCreateUnitFromWorkspace(change.workspace!)}
        >
          <Plus size={14} />
          带入新建制作项
        </Button>
      ) : null}
      {change.state === "changed" && change.currentUnitId ? (
        <div className="content-workbench-review-diff-card__actions">
          {change.workspace ? (
            <Button
              size="sm"
              variant="outline"
              className="content-workbench-review-panel__icon-button"
              data-testid="content-workbench-apply-workspace-unit"
              onClick={() => onApplyUnitWorkspace(change.currentUnitId!, change.workspace!)}
            >
              <CheckCircle2 size={14} />
              采纳草案字段
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="content-workbench-review-panel__icon-button"
            data-testid="content-workbench-edit-current-unit"
            onClick={() => onEditCurrentUnit(change.currentUnitId!)}
          >
            <Pencil size={14} />
            手动编辑
          </Button>
        </div>
      ) : null}
      {(change.before || change.after) ? (
        <div className="content-workbench-review-snapshot-grid">
          {change.before ? <ContentWorkbenchReviewSnapshotValue tone="danger" label="当前" value={change.before} /> : null}
          {change.after ? <ContentWorkbenchReviewSnapshotValue tone="success" label="草案" value={change.after} /> : null}
        </div>
      ) : null}
      {change.fields.length > 0 ? (
        <div className="content-workbench-review-field-diff-list">
          {change.fields.map((field) => (
            <ContentWorkbenchReviewFieldDiffRow key={field.label} field={field} />
          ))}
        </div>
      ) : null}
    </AppSurfaceItem>
  );
}

function ContentWorkbenchReviewSnapshotValue({
  tone,
  label,
  value,
}: {
  tone: "danger" | "success";
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="content-workbench-review-snapshot-value" data-tone={tone}>
      {label}：{value}
    </div>
  );
}

function ContentWorkbenchReviewFieldDiffRow({
  field,
}: {
  field: ContentWorkbenchReviewFieldDiff;
}) {
  return (
    <div className="content-workbench-review-field-diff-row">
      <span className="content-workbench-review-field-diff-row__label">{field.label}</span>
      <AppInlineMeta className="content-workbench-review-field-diff-row__before">{field.before || "空"}</AppInlineMeta>
      <ArrowRight size={12} className="content-workbench-review-field-diff-row__arrow" />
      <AppInlineMeta className="content-workbench-review-field-diff-row__after">{field.after || "空"}</AppInlineMeta>
    </div>
  );
}

function contentWorkbenchReviewQueueIntent(state?: ContentWorkbenchReviewQueueState) {
  if (state === "processed") return "success";
  if (state === "needs_review" || state === "pending_review") return "warning";
  return "neutral";
}

function contentSnapshotStateLabel(state: ContentWorkbenchReviewDiffState) {
  if (state === "added") return "快照新增";
  if (state === "changed") return "快照变更";
  if (state === "unchanged") return "快照一致";
  return "媒体计划";
}

function contentSnapshotKindLabel(kind: ContentWorkbenchReviewDiffKind) {
  if (kind === "content_unit") return "制作项快照";
  return "关键帧快照";
}
