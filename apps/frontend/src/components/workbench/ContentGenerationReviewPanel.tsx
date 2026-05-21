import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Pencil,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'

import type { AgentDraft } from '@/lib/localAgentClient'
import type { ContentDraftReviewModel, ContentSnapshotDiffKind, ContentSnapshotDiffState } from '@/lib/contentWorkbenchDraftReviewModel'
import type { ContentWorkbenchReviewQueueSummary } from '@/lib/contentWorkbenchReviewQueue'
import { cn } from '@/lib/utils'
import { Badge, Button } from '@movscript/ui'
import { ProposalReviewShell } from '@/components/proposals/ProposalReviewShell'

export function ContentGenerationReviewPanel({
  reviewMode,
  drafts,
  selectedDraft,
  reviewModel,
  queueSummary,
  rejectingDraft,
  markingDraftReviewed,
  onOpenAiSuggest,
  onSelectDraft,
  onCreateUnitFromProposal,
  onEditCurrentUnit,
  onApplyUnitProposal,
  onMarkDraftReviewed,
  onRejectDraft,
  onCloseReview,
}: {
  reviewMode: boolean
  drafts: AgentDraft[]
  selectedDraft: AgentDraft | null
  reviewModel: ContentDraftReviewModel | null
  queueSummary: ContentWorkbenchReviewQueueSummary
  rejectingDraft: boolean
  markingDraftReviewed: boolean
  onOpenAiSuggest: () => void
  onSelectDraft: (draftId: string) => void
  onCreateUnitFromProposal: (proposal: Record<string, unknown>) => void
  onEditCurrentUnit: (unitId: number) => void
  onApplyUnitProposal: (unitId: number, proposal: Record<string, unknown>) => void
  onMarkDraftReviewed: (draft: AgentDraft) => void
  onRejectDraft: (draft: AgentDraft) => void
  onCloseReview: () => void
}) {
  return (
    <ProposalReviewShell
      kind="content_unit_proposal"
      title="AI 审稿队列"
      icon={ClipboardCheck}
      description="审阅内容编排草案，对制作项和关键帧快照执行创建、编辑、确认或退回。"
      action={(
        <div className="flex items-center gap-2">
          <Badge variant={queueSummary.tone === 'success' ? 'success' : queueSummary.tone === 'warning' ? 'warning' : 'outline'}>
            {queueSummary.pending > 0 ? `${queueSummary.pending} 待审` : `${queueSummary.total} 草案`}
          </Badge>
          <Button size="sm" variant="outline" className="gap-2" onClick={onCloseReview}>
            <Database size={13} />
            {reviewMode ? '退出审阅' : '收起审阅'}
          </Button>
        </div>
      )}
    >
      <div
        className={cn(
          'mb-3 rounded-md border px-2.5 py-2.5',
          queueSummary.tone === 'warning'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
            : queueSummary.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20'
              : 'border-border bg-background',
        )}
        data-testid="content-workbench-review-queue"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-medium text-foreground">
              <Bot size={15} className="text-muted-foreground" />
              {queueSummary.title}
            </div>
            <p className="mt-1 type-label leading-5 text-muted-foreground">{queueSummary.detail}</p>
          </div>
          <Button
            size="sm"
            variant={queueSummary.total === 0 ? 'default' : 'outline'}
            className="gap-2"
            onClick={queueSummary.total === 0 ? onOpenAiSuggest : undefined}
            disabled={queueSummary.total > 0}
          >
            <Sparkles size={13} />
            {queueSummary.actionLabel}
          </Button>
        </div>
        {queueSummary.total > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 type-label text-muted-foreground" data-testid="content-workbench-review-metrics">
            <span className={queueSummary.pending > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.pending} 待审</span>
            <span className="text-border">/</span>
            <span>{queueSummary.addedCount} 新增</span>
            <span className="text-border">/</span>
            <span className={queueSummary.changedCount > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.changedCount} 变更</span>
            <span className="text-border">/</span>
            <span className={queueSummary.warningCount > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{queueSummary.warningCount} 风险</span>
          </div>
        ) : null}
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-6 type-body text-muted-foreground">
          还没有制作项草案。先通过 AI 助手生成 snapshot 草案，审阅区会显示当前快照和草案快照的对比。
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {drafts.map((draft) => {
              const active = selectedDraft?.id === draft.id
              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onSelectDraft(draft.id)}
                  className={cn(
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    active ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate type-body font-medium text-foreground">{draft.title}</p>
                      <p className="mt-1 truncate type-caption text-muted-foreground">制作项快照 · {draft.status}</p>
                    </div>
                    <Badge variant={active ? 'secondary' : 'outline'} className="shrink-0 type-tiny">
                      结构
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="min-w-0 rounded-md border border-border bg-background p-2.5">
            {!selectedDraft || !reviewModel ? (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center type-body text-muted-foreground">选择一个草案后查看快照对比。</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="type-body font-semibold text-foreground">{selectedDraft.title}</h3>
                      <Badge variant="secondary" className="type-tiny">制作项快照</Badge>
                    </div>
                    <p className="mt-1 type-label leading-5 text-muted-foreground">
                      {reviewModel.targetLabel} · {reviewModel.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reviewModel.stats.map((stat) => (
                      <Badge key={stat.label} variant="outline" className="type-tiny">{stat.label} {stat.value}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <p className="type-label leading-5 text-muted-foreground">
                    内容编排草案当前只做 snapshot 审阅；按差异创建、编辑或确认无需写入后，可标记为人工已处理，或退回草案清理待审队列。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-2"
                      data-testid="content-workbench-mark-draft-reviewed"
                      onClick={() => onMarkDraftReviewed(selectedDraft)}
                      loading={markingDraftReviewed}
                      disabled={markingDraftReviewed || selectedDraft.status === 'applied'}
                    >
                      <CheckCircle2 size={13} />
                      {selectedDraft.status === 'applied' ? '已处理' : '标记人工已处理'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onRejectDraft(selectedDraft)}
                      loading={rejectingDraft}
                      disabled={rejectingDraft || selectedDraft.status === 'rejected'}
                    >
                      <X size={13} />
                      退回草案
                    </Button>
                  </div>
                </div>

                {reviewModel.warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 type-label text-amber-800">
                    {reviewModel.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {reviewModel.diffs.map((change) => (
                    <div key={change.key} className="rounded-md border border-border bg-muted/10 px-2.5 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={change.state === 'added' ? 'secondary' : change.state === 'unchanged' ? 'outline' : 'default'} className="type-tiny">
                              {contentSnapshotStateLabel(change.state)}
                            </Badge>
                            <Badge variant="outline" className="type-tiny">{contentSnapshotKindLabel(change.kind)}</Badge>
                            <span className="truncate type-body font-medium text-foreground">{change.title}</span>
                          </div>
                          <p className="mt-1 type-caption text-muted-foreground">{change.target}</p>
                        </div>
                        <p className="type-caption text-muted-foreground">{change.impact}</p>
                      </div>
                      {change.detail ? <p className="mt-2 type-label leading-5 text-foreground">{change.detail}</p> : null}
                      {change.state === 'added' && change.proposal ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 gap-2"
                          data-testid="content-workbench-create-proposal-unit"
                          onClick={() => onCreateUnitFromProposal(change.proposal!)}
                        >
                          <Plus size={13} />
                          带入新建制作项
                        </Button>
                      ) : null}
                      {change.state === 'changed' && change.currentUnitId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {change.proposal ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              data-testid="content-workbench-apply-proposal-unit"
                              onClick={() => onApplyUnitProposal(change.currentUnitId!, change.proposal!)}
                            >
                              <CheckCircle2 size={13} />
                              采纳草案字段
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            data-testid="content-workbench-edit-current-unit"
                            onClick={() => onEditCurrentUnit(change.currentUnitId!)}
                          >
                            <Pencil size={13} />
                            手动编辑
                          </Button>
                        </div>
                      ) : null}
                      {(change.before || change.after) ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {change.before ? <div className="rounded bg-rose-500/10 px-2 py-1 type-label text-rose-700 dark:text-rose-300">当前：{change.before}</div> : null}
                          {change.after ? <div className="rounded bg-emerald-500/10 px-2 py-1 type-label text-emerald-700 dark:text-emerald-300">草案：{change.after}</div> : null}
                        </div>
                      ) : null}
                      {change.fields.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {change.fields.map((field) => (
                            <div key={field.label} className="flex flex-wrap items-center gap-2 type-label">
                              <span className="w-14 shrink-0 text-muted-foreground">{field.label}</span>
                              <span className="rounded bg-muted px-2 py-1 text-muted-foreground">{field.before || '空'}</span>
                              <ArrowRight size={12} className="text-muted-foreground" />
                              <span className="rounded bg-primary/10 px-2 py-1 text-foreground">{field.after || '空'}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ProposalReviewShell>
  )
}

function contentSnapshotStateLabel(state: ContentSnapshotDiffState) {
  if (state === 'added') return '快照新增'
  if (state === 'changed') return '快照变更'
  if (state === 'unchanged') return '快照一致'
  return '媒体计划'
}

function contentSnapshotKindLabel(kind: ContentSnapshotDiffKind) {
  if (kind === 'content_unit') return '制作项快照'
  return '关键帧快照'
}
