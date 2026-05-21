import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Trash2 } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'

import { localAgentClient, type AgentDraft, type AgentDraftKind } from '@/lib/localAgentClient'
import { ProposalReviewShell } from '@/components/proposals/ProposalReviewShell'
import { isRecord } from '@/lib/jsonValue'
import {
  buildProjectLayerDraftContentForEntries,
  buildProjectLayerProposalEntryDiffRows,
  draftAppliedEntryKeySet,
  formatProjectLayerProposalEntry,
  parseProjectLayerProposalDraft,
  projectLayerProposalEntryChangeLabel,
  projectLayerProposalEntryLabel,
  type ProjectLayerProposalData,
  type ProjectLayerProposalEntry,
  type ProjectLayerProposalView,
} from '@/lib/projectLayerProposalReview'
import { cn } from '@/lib/utils'
import { toast } from '@/store/toastStore'

type EntryDecision = 'rejected' | 'submitted'
type EntryDecisions = Record<string, EntryDecision>

export interface ProjectLayerProposalReviewPanelProps {
  projectId?: number
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>
  title: string
  description: string
  emptyMessage: string
  drafts: AgentDraft[]
  loading: boolean
  data: ProjectLayerProposalData
  onApplied?: () => Promise<void> | void
}

export function ProjectLayerProposalReviewPanel({
  projectId,
  kind,
  title,
  description,
  emptyMessage,
  drafts,
  loading,
  data,
  onApplied,
}: ProjectLayerProposalReviewPanelProps) {
  const [decisions, setDecisions] = useState<EntryDecisions>({})
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const includeCreativeReferences = kind === 'setting_proposal'
  const includeAssetSlots = kind === 'asset_proposal'
  const reviewableDrafts = useMemo(() => drafts.filter((draft) => !isHelperDraft(draft)), [drafts])
  const referenceLabels = useMemo(() => new Map(data.creativeReferences.map((reference) => [String(reference.ID), reference.name || reference.title || `设定 #${reference.ID}`])), [data.creativeReferences])

  function markDecision(key: string, decision: EntryDecision) {
    setDecisions((current) => ({ ...current, [key]: decision }))
  }

  function clearDecision(key: string) {
    setDecisions((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function metadataWithAppliedEntries(draft: AgentDraft, entryKeys: string[]) {
    const appliedEntryKeys = new Set([
      ...draftAppliedEntryKeySet(draft),
      ...entryKeys,
    ])
    return {
      ...(isRecord(draft.metadata) ? draft.metadata : {}),
      reviewedFrom: kind === 'setting_proposal' ? 'setting-workbench' : 'asset-proposal-workbench',
      reviewedAt: new Date().toISOString(),
      appliedEntryKeys: Array.from(appliedEntryKeys),
    }
  }

  async function applyEntries(
    draft: AgentDraft,
    entries: ProjectLayerProposalEntry[],
    lockId: string = draft.id,
    proposedValueOverride?: string,
  ) {
    if (!projectId || entries.length === 0) return false
    setApplyingDraftId(lockId)
    try {
      const proposedValue = proposedValueOverride ?? buildProjectLayerDraftContentForEntries(draft, entries, data, entries.length === 1
        ? `单项提交：${formatProjectLayerProposalEntry(entries[0])}`
        : `批量提交：${entries.length} 项`)
      await localAgentClient.applyDraft(draft.id, {
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        currentValue: {
          creativeReferences: data.creativeReferences.length,
          assetSlots: data.assetSlots.length,
        },
        proposedValue,
      })
      await localAgentClient.updateDraft(draft.id, {
        metadata: metadataWithAppliedEntries(draft, entries.map((entry) => entry.key)),
      })
      toast.success(entries.length === 1 ? '已提交此项' : '提案已提交')
      await onApplied?.()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提案应用失败')
      return false
    } finally {
      setApplyingDraftId(null)
    }
  }

  async function applyEntry(draft: AgentDraft, entry: ProjectLayerProposalEntry) {
    try {
      const proposedValue = buildProjectLayerDraftContentForEntries(draft, [entry], data, `单项提交：${formatProjectLayerProposalEntry(entry)}`)
      const helperDraft = await localAgentClient.createDraft({
        projectId,
        kind,
        title: `单项提交 - ${formatProjectLayerProposalEntry(entry)}`,
        content: proposedValue,
        source: {
          ...(isRecord(draft.source) ? draft.source : {}),
          sourceDraftId: draft.id,
          sourceEntryKey: entry.key,
          sourceEntryLabel: entry.label,
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        metadata: {
          helperDraft: true,
          sourceDraftId: draft.id,
          sourceEntryKey: entry.key,
        },
      })
      const applied = await applyEntries(helperDraft, [entry], draft.id, proposedValue)
      if (!applied) return
      await localAgentClient.updateDraft(draft.id, {
        metadata: metadataWithAppliedEntries(draft, [entry.key]),
      })
      markDecision(entry.key, 'submitted')
      await onApplied?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提案应用失败')
    }
  }

  async function applyDraft(draft: AgentDraft, view: ProjectLayerProposalView) {
    const entries = [
      ...(includeCreativeReferences ? view.creativeReferences : []),
      ...(includeAssetSlots ? view.assetSlots : []),
    ]
    const pendingEntries = entries.filter((entry) => decisions[entry.key] !== 'rejected' && !entry.applied && entry.changeType !== 'unchanged')
    if (pendingEntries.length === 0) {
      toast.error('没有可提交的变更')
      return
    }
    await applyEntries(draft, pendingEntries)
  }

  return (
    <ProposalReviewShell
      kind={kind}
      title={title}
      description={description}
      countLabel={`${reviewableDrafts.length} 项`}
    >
      <div className="mt-3 grid min-w-0 gap-3">
        {loading ? <p className="rounded-md border border-border bg-background px-3 py-3 type-label text-muted-foreground">读取审阅草稿...</p> : null}
        {!loading && reviewableDrafts.length === 0 ? <p className="rounded-md border border-dashed border-border bg-background px-3 py-3 type-label text-muted-foreground">{emptyMessage}</p> : null}
        {reviewableDrafts.map((draft) => {
          const view = parseProjectLayerProposalDraft(draft, data, { includeCreativeReferences, includeAssetSlots })
          const entries = view ? [...view.creativeReferences, ...view.assetSlots] : []
          const pendingEntries = entries.filter((entry) => decisions[entry.key] !== 'rejected' && !entry.applied && entry.changeType !== 'unchanged')
          const submittedEntries = entries.filter((entry) => decisions[entry.key] === 'submitted' || entry.applied)
          const rejectedEntries = entries.filter((entry) => decisions[entry.key] === 'rejected')
          const addedEntries = entries.filter((entry) => entry.changeType === 'added')
          const modifiedEntries = entries.filter((entry) => entry.changeType === 'modified')
          const deletedEntries = entries.filter((entry) => entry.changeType === 'deleted')
          return (
            <div key={draft.id} className="min-w-0 rounded-md border border-border bg-background p-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate type-label font-semibold text-foreground">{draft.title}</p>
                  <p className="mt-1 break-all type-tiny text-muted-foreground">{formatDate(draft.updatedAt)} · {draft.id}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Badge variant={draft.status === 'applied' ? 'success' : 'outline'} className="type-tiny">{draft.status}</Badge>
                  <Badge variant="outline" className="type-tiny">{entries.length} 条变更</Badge>
                </div>
              </div>

              {view ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="type-tiny leading-4 text-muted-foreground">{view.summary}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="h-5 rounded-full px-1.5 type-tiny">{addedEntries.length} 新增</Badge>
                        <Badge variant="outline" className="h-5 rounded-full px-1.5 type-tiny">{modifiedEntries.length} 修改</Badge>
                        <Badge variant="destructive" className="h-5 rounded-full px-1.5 type-tiny">{deletedEntries.length} 删除</Badge>
                        <Badge variant="success" className="h-5 rounded-full px-1.5 type-tiny">{submittedEntries.length} 已提交</Badge>
                        {rejectedEntries.length > 0 ? <Badge variant="destructive" className="h-5 rounded-full px-1.5 type-tiny">{rejectedEntries.length} 已忽略</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        className="px-2 type-tiny"
                        onClick={() => setDecisions((current) => {
                          const next = { ...current }
                          for (const entry of entries) delete next[entry.key]
                          return next
                        })}
                      >
                        重置状态
                      </Button>
                      <Button
                        size="xs"
                        className="px-2 type-tiny"
                        loading={applyingDraftId === draft.id}
                        disabled={draft.status === 'applied' || pendingEntries.length === 0}
                        onClick={() => void applyDraft(draft, view)}
                      >
                        <CheckCircle2 size={12} />
                        提交剩余
                      </Button>
                    </div>
                  </div>

                  {entries.length > 0 ? (
                    <div className="space-y-2">
                      {entries.map((entry) => {
                        const rows = buildProjectLayerProposalEntryDiffRows(entry, data, referenceLabels)
                        const isSubmitted = entry.applied || decisions[entry.key] === 'submitted'
                        const isRejected = decisions[entry.key] === 'rejected'
                        return (
                          <div key={entry.key} className={cn(
                            'rounded-md border px-2.5 py-2',
                            entry.changeType === 'deleted'
                              ? 'border-rose-500/40 bg-rose-500/5'
                              : entry.changeType === 'unchanged'
                                ? 'border-border/60 bg-muted/20'
                                : 'border-border/70 bg-card',
                          )}>
                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 basis-64">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="min-w-0 break-words type-tiny font-medium text-foreground">{formatProjectLayerProposalEntry(entry)}</span>
                                  <Badge variant={entry.changeType === 'deleted' ? 'destructive' : entry.changeType === 'added' ? 'secondary' : 'outline'} className="h-5 rounded-full px-1.5 type-micro">
                                    {entry.changeType === 'deleted' ? <Trash2 size={9} /> : null}
                                    {projectLayerProposalEntryChangeLabel(entry)}
                                  </Badge>
                                  {entry.inferred ? <Badge variant="outline" className="h-5 rounded-full px-1.5 type-micro">缺席推断</Badge> : null}
                                  <Badge variant="outline" className="h-5 rounded-full px-1.5 type-micro">{projectLayerProposalEntryLabel(entry)}</Badge>
                                  {isSubmitted ? <Badge variant="success" className="h-5 rounded-full px-1.5 type-micro">已提交</Badge> : null}
                                  {isRejected ? <Badge variant="destructive" className="h-5 rounded-full px-1.5 type-micro">已忽略</Badge> : null}
                                </div>
                                <p className="mt-1 type-tiny leading-4 text-muted-foreground">{entry.detail}</p>
                              </div>
                              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                {isSubmitted ? null : (
                                  <Button
                                    size="xs"
                                    className="px-2 type-tiny"
                                    loading={applyingDraftId === draft.id}
                                    disabled={draft.status === 'applied' || entry.changeType === 'unchanged'}
                                    onClick={() => void applyEntry(draft, entry)}
                                  >
                                    提交此项
                                  </Button>
                                )}
                                {isRejected ? (
                                  <Button size="xs" variant="outline" className="px-2 type-tiny" onClick={() => clearDecision(entry.key)}>
                                    恢复
                                  </Button>
                                ) : (
                                  <Button size="xs" variant="outline" className="px-2 type-tiny" onClick={() => markDecision(entry.key, 'rejected')}>
                                    忽略
                                  </Button>
                                )}
                              </div>
                            </div>

                            {rows.length > 0 ? (
                              <div className="mt-2 space-y-1 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1">
                                {rows.map((row, index) => (
                                  <div key={`${entry.key}-${row.label}-${index}`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 type-tiny leading-4">
                                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-muted-foreground">{row.label}</span>
                                    <span className={cn('min-w-0 flex-1 truncate', row.before ? 'line-through text-muted-foreground' : 'text-muted-foreground')}>
                                      {row.before || '新增'}
                                    </span>
                                    <ArrowRight size={9} className="mt-0.5 shrink-0 text-muted-foreground" />
                                    <span className={cn(
                                      'min-w-0 flex-1 truncate',
                                      row.tone === 'added' ? 'text-emerald-700 dark:text-emerald-300' : row.tone === 'deleted' ? 'text-rose-700 dark:text-rose-300' : 'text-foreground',
                                    )}>
                                      {row.after || '未填写'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-2 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1 type-tiny text-muted-foreground">
                                没有可展示的字段差异。
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 type-tiny text-muted-foreground">
                      这份草稿没有可展示的 diff。
                    </div>
                  )}

                  {view.impactNotes.length > 0 ? (
                    <div className="space-y-1 rounded-md border border-border bg-background/70 p-2">
                      <p className="type-tiny font-medium text-foreground">影响说明</p>
                      {view.impactNotes.slice(0, 4).map((note, index) => (
                        <p key={`${draft.id}-impact-${index}`} className="type-tiny leading-4 text-muted-foreground">{note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 type-tiny text-muted-foreground">
                  无法解析这份草稿的差异。
                </div>
              )}
            </div>
          )
        })}

      </div>
    </ProposalReviewShell>
  )
}

function isHelperDraft(draft: AgentDraft) {
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  return typeof metadata.sourceDraftId === 'string' && metadata.sourceDraftId.trim().length > 0
}

function formatDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
