import { useMemo, useState } from 'react'
import { CheckCircle2, GitBranch, Trash2 } from 'lucide-react'
import {
  ProjectProposalReviewActionButton,
  ProjectProposalReviewBadge,
  ProjectProposalReviewCallout,
  ProjectProposalReviewDetailText,
  ProjectProposalReviewEmptyText,
  ProjectProposalReviewEntryCallout,
  ProjectProposalReviewLoadingState,
  ProjectProposalReviewNoteList,
  ProjectProposalReviewStatusBadge,
  ReviewProposalDraftList,
  ReviewProposalDraftPanel,
  ReviewProposalEntryHeader,
  ReviewProposalFieldDiffList,
  ReviewProposalFieldDiffRow,
  ReviewProposalShell,
  ReviewProposalSummaryCallout,
} from '@movscript/ui'

import { localAgentClient, type AgentDraft, type AgentDraftKind } from '@/shared/infrastructure/localAgentClient'
import { isRecord } from '@/shared/domain/jsonValue'
import {
  buildPreProductionDraftContentForEntries,
  buildPreProductionProposalEntryDiffRows,
  draftAppliedEntryKeySet,
  formatPreProductionProposalEntry,
  parsePreProductionProposalDraft,
  preProductionProposalEntryChangeLabel,
  preProductionProposalEntryLabel,
  type PreProductionProposalData,
  type PreProductionProposalEntry,
  type PreProductionProposalView,
} from '@/features/pre-production/domain/preProductionProposalReview'
import { toast } from '@/shared/ui/toastStore'
import {
  preProductionProposalCountRecipe,
  preProductionProposalDecisionRecipe,
  preProductionProposalDraftStatusRecipe,
  preProductionProposalEntryChangeRecipe,
} from '@/features/pre-production/presentation/preProductionSemanticUi'

type EntryDecision = 'rejected' | 'submitted'
type EntryDecisions = Record<string, EntryDecision>

export interface PreProductionProposalReviewPanelProps {
  projectId?: number
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>
  title: string
  description: string
  emptyMessage: string
  drafts: AgentDraft[]
  loading: boolean
  data: PreProductionProposalData
  onApplied?: () => Promise<void> | void
}

export function PreProductionProposalReviewPanel({
  projectId,
  kind,
  title,
  description,
  emptyMessage,
  drafts,
  loading,
  data,
  onApplied,
}: PreProductionProposalReviewPanelProps) {
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
    entries: PreProductionProposalEntry[],
    lockId: string = draft.id,
    proposedValueOverride?: string,
  ) {
    if (!projectId || entries.length === 0) return false
    setApplyingDraftId(lockId)
    try {
      const proposedValue = proposedValueOverride ?? buildPreProductionDraftContentForEntries(draft, entries, data, entries.length === 1
        ? `单项提交：${formatPreProductionProposalEntry(entries[0])}`
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

  async function applyEntry(draft: AgentDraft, entry: PreProductionProposalEntry) {
    try {
      const proposedValue = buildPreProductionDraftContentForEntries(draft, [entry], data, `单项提交：${formatPreProductionProposalEntry(entry)}`)
      const helperDraft = await localAgentClient.createDraft({
        projectId,
        kind,
        title: `单项提交 - ${formatPreProductionProposalEntry(entry)}`,
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

  async function applyDraft(draft: AgentDraft, view: PreProductionProposalView) {
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
    <ReviewProposalShell
      kind={kind}
      title={title}
      description={description}
      icon={GitBranch}
      countLabel={`${reviewableDrafts.length} 项`}
    >
      <ReviewProposalDraftList>
        {loading ? <ProjectProposalReviewLoadingState text="读取审阅草稿..." /> : null}
        {!loading && reviewableDrafts.length === 0 ? <ProjectProposalReviewEmptyText>{emptyMessage}</ProjectProposalReviewEmptyText> : null}
        {reviewableDrafts.map((draft) => {
          const view = parsePreProductionProposalDraft(draft, data, { includeCreativeReferences, includeAssetSlots })
          const entries = view ? [...view.creativeReferences, ...view.assetSlots] : []
          const diffEntries = entries.filter((entry) => entry.changeType !== 'unchanged')
          const pendingEntries = entries.filter((entry) => decisions[entry.key] !== 'rejected' && !entry.applied && entry.changeType !== 'unchanged')
          const submittedEntries = entries.filter((entry) => decisions[entry.key] === 'submitted' || entry.applied)
          const rejectedEntries = entries.filter((entry) => decisions[entry.key] === 'rejected')
          const addedEntries = entries.filter((entry) => entry.changeType === 'added')
          const modifiedEntries = entries.filter((entry) => entry.changeType === 'modified')
          const deletedEntries = entries.filter((entry) => entry.changeType === 'deleted')
          return (
            <ReviewProposalDraftPanel
              key={draft.id}
              title={draft.title}
              meta={`${formatDate(draft.updatedAt)} · ${draft.id}`}
              badges={
                <>
                  <ProjectProposalReviewStatusBadge {...preProductionProposalDraftStatusRecipe(draft.status)}>{draft.status}</ProjectProposalReviewStatusBadge>
                  <ProjectProposalReviewBadge variant="outline">{diffEntries.length} 条变更</ProjectProposalReviewBadge>
                </>
              }
            >
              {view ? (
                <>
                  <ReviewProposalSummaryCallout
                    summary={view.summary}
                    badges={
                      <>
                        <ProjectProposalReviewBadge>{addedEntries.length} 新增</ProjectProposalReviewBadge>
                        <ProjectProposalReviewBadge variant="outline">{modifiedEntries.length} 修改</ProjectProposalReviewBadge>
                        <ProjectProposalReviewStatusBadge {...preProductionProposalCountRecipe('deleted')}>{deletedEntries.length} 删除</ProjectProposalReviewStatusBadge>
                        <ProjectProposalReviewStatusBadge {...preProductionProposalCountRecipe('submitted')}>{submittedEntries.length} 已提交</ProjectProposalReviewStatusBadge>
                        {rejectedEntries.length > 0 ? <ProjectProposalReviewStatusBadge {...preProductionProposalCountRecipe('rejected')}>{rejectedEntries.length} 已忽略</ProjectProposalReviewStatusBadge> : null}
                      </>
                    }
                    actions={
                      <>
                      <ProjectProposalReviewActionButton
                        size="xs"
                        variant="outline"
                        onClick={() => setDecisions((current) => {
                          const next = { ...current }
                          for (const entry of entries) delete next[entry.key]
                          return next
                        })}
                      >
                        重置状态
                      </ProjectProposalReviewActionButton>
                      <ProjectProposalReviewActionButton
                        size="xs"
                        loading={applyingDraftId === draft.id}
                        disabled={draft.status === 'applied' || pendingEntries.length === 0}
                        onClick={() => void applyDraft(draft, view)}
                      >
                        <CheckCircle2 size={12} />
                        提交剩余
                      </ProjectProposalReviewActionButton>
                      </>
                    }
                  />

                  {diffEntries.length > 0 ? (
                    <ReviewProposalDraftList>
                      {diffEntries.map((entry) => {
                        const rows = buildPreProductionProposalEntryDiffRows(entry, data, referenceLabels)
                        const isSubmitted = entry.applied || decisions[entry.key] === 'submitted'
                        const isRejected = decisions[entry.key] === 'rejected'
                        return (
                          <ProjectProposalReviewEntryCallout key={entry.key} change={entry.changeType}>
                            <ReviewProposalEntryHeader
                              title={formatPreProductionProposalEntry(entry)}
                              badges={
                                <>
                                  <ProjectProposalReviewStatusBadge {...preProductionProposalEntryChangeRecipe(entry.changeType)} size="micro">
                                    {entry.changeType === 'deleted' ? <Trash2 size={10} /> : null}
                                    {preProductionProposalEntryChangeLabel(entry)}
                                  </ProjectProposalReviewStatusBadge>
                                  {entry.inferred ? <ProjectProposalReviewBadge variant="outline" size="micro">缺席推断</ProjectProposalReviewBadge> : null}
                                  <ProjectProposalReviewBadge variant="outline" size="micro">{preProductionProposalEntryLabel(entry)}</ProjectProposalReviewBadge>
                                  {isSubmitted ? <ProjectProposalReviewStatusBadge {...preProductionProposalDecisionRecipe('submitted')} size="micro">已提交</ProjectProposalReviewStatusBadge> : null}
                                  {isRejected ? <ProjectProposalReviewStatusBadge {...preProductionProposalDecisionRecipe('rejected')} size="micro">已忽略</ProjectProposalReviewStatusBadge> : null}
                                </>
                              }
                              actions={
                                <>
                                {isSubmitted ? null : (
                                  <ProjectProposalReviewActionButton
                                    size="xs"
                                    loading={applyingDraftId === draft.id}
                                    disabled={draft.status === 'applied' || entry.changeType === 'unchanged'}
                                    onClick={() => void applyEntry(draft, entry)}
                                  >
                                    提交此项
                                  </ProjectProposalReviewActionButton>
                                )}
                                {isRejected ? (
                                  <ProjectProposalReviewActionButton size="xs" variant="outline" onClick={() => clearDecision(entry.key)}>
                                    恢复
                                  </ProjectProposalReviewActionButton>
                                ) : (
                                  <ProjectProposalReviewActionButton size="xs" variant="outline" onClick={() => markDecision(entry.key, 'rejected')}>
                                    忽略
                                  </ProjectProposalReviewActionButton>
                                )}
                                </>
                              }
                            />
                            <ProjectProposalReviewDetailText>{entry.detail}</ProjectProposalReviewDetailText>

                            {rows.length > 0 ? (
                              <ReviewProposalFieldDiffList>
                                {rows.map((row, index) => (
                                  <ReviewProposalFieldDiffRow
                                    key={`${entry.key}-${row.label}-${index}`}
                                    label={row.label}
                                    before={row.before}
                                    after={row.after}
                                    change={row.changeType === 'added' ? 'added' : row.changeType === 'deleted' ? 'deleted' : 'unchanged'}
                                  />
                                ))}
                              </ReviewProposalFieldDiffList>
                            ) : (
                              <ProjectProposalReviewEmptyText>
                                没有可展示的字段差异。
                              </ProjectProposalReviewEmptyText>
                            )}
                          </ProjectProposalReviewEntryCallout>
                        )
                      })}
                    </ReviewProposalDraftList>
                  ) : (
                    <ProjectProposalReviewEmptyText>
                      这份草稿没有可展示的 diff。
                    </ProjectProposalReviewEmptyText>
                  )}

                  {view.impactNotes.length > 0 ? (
                    <ProjectProposalReviewCallout tone="neutral" compact title="影响说明">
                      <ProjectProposalReviewNoteList notes={view.impactNotes} itemKeyPrefix={`${draft.id}-impact`} />
                    </ProjectProposalReviewCallout>
                  ) : null}
                </>
              ) : (
                <ProjectProposalReviewEmptyText>
                  无法解析这份草稿的差异。
                </ProjectProposalReviewEmptyText>
              )}
            </ReviewProposalDraftPanel>
          )
        })}

      </ReviewProposalDraftList>
    </ReviewProposalShell>
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
