import { useMemo, useState } from 'react'
import { CheckCircle2, GitBranch, Trash2 } from 'lucide-react'
import {
  ProjectWorkspaceReviewActionButton,
  ProjectWorkspaceReviewBadge,
  ProjectWorkspaceReviewCallout,
  ProjectWorkspaceReviewDetailText,
  ProjectWorkspaceReviewEmptyText,
  ProjectWorkspaceReviewEntryCallout,
  ProjectWorkspaceReviewLoadingState,
  ProjectWorkspaceReviewNoteList,
  ProjectWorkspaceReviewStatusBadge,
  ReviewWorkspaceArtifactList,
  ReviewWorkspaceArtifactPanel,
  ReviewWorkspaceEntryHeader,
  ReviewWorkspaceFieldDiffList,
  ReviewWorkspaceFieldDiffRow,
  ReviewWorkspaceShell,
  ReviewWorkspaceSummaryCallout,
} from '@movscript/ui'

import { providerSessionClient, type WorkspaceArtifact, type MovScriptWorkspaceKind } from '@/shared/infrastructure/providerSessionClient'
import { isRecord } from '@/shared/domain/jsonValue'
import {
  buildPreProductionWorkspaceContentForEntries,
  buildPreProductionWorkspaceEntryDiffRows,
  workspaceAppliedEntryKeySet,
  formatPreProductionWorkspaceEntry,
  parsePreProductionWorkspaceArtifact,
  preProductionWorkspaceEntryChangeLabel,
  preProductionWorkspaceEntryLabel,
  type PreProductionWorkspaceData,
  type PreProductionWorkspaceEntry,
  type PreProductionWorkspaceView,
} from '@/features/pre-production/domain/preProductionWorkspaceReview'
import { toast } from '@/shared/ui/toastStore'
import {
  preProductionWorkspaceCountRecipe,
  preProductionWorkspaceDecisionRecipe,
  preProductionWorkspaceArtifactStatusRecipe,
  preProductionWorkspaceEntryChangeRecipe,
} from '@/features/pre-production/presentation/preProductionSemanticUi'

type EntryDecision = 'rejected' | 'submitted'
type EntryDecisions = Record<string, EntryDecision>

export interface PreProductionWorkspaceReviewPanelProps {
  projectId?: number
  kind: Extract<MovScriptWorkspaceKind, 'setting_workspace' | 'asset_workspace'>
  title: string
  description: string
  emptyMessage: string
  workspaces: WorkspaceArtifact[]
  loading: boolean
  data: PreProductionWorkspaceData
  onApplied?: () => Promise<void> | void
}

export function PreProductionWorkspaceReviewPanel({
  projectId,
  kind,
  title,
  description,
  emptyMessage,
  workspaces,
  loading,
  data,
  onApplied,
}: PreProductionWorkspaceReviewPanelProps) {
  const [decisions, setDecisions] = useState<EntryDecisions>({})
  const [applyingWorkspaceId, setApplyingWorkspaceId] = useState<string | null>(null)
  const includeCreativeReferences = kind === 'setting_workspace'
  const includeAssetSlots = kind === 'asset_workspace'
  const reviewableWorkspaces = useMemo(() => workspaces.filter((workspace) => !isHelperWorkspace(workspace)), [workspaces])
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

  function metadataWithAppliedEntries(workspace: WorkspaceArtifact, entryKeys: string[]) {
    const appliedEntryKeys = new Set([
      ...workspaceAppliedEntryKeySet(workspace),
      ...entryKeys,
    ])
    return {
      ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
      reviewedFrom: kind === 'setting_workspace' ? 'setting-workbench' : 'asset-workspace-workbench',
      reviewedAt: new Date().toISOString(),
      appliedEntryKeys: Array.from(appliedEntryKeys),
    }
  }

  async function applyEntries(
    workspace: WorkspaceArtifact,
    entries: PreProductionWorkspaceEntry[],
    lockId: string = workspace.id,
    proposedValueOverride?: string,
  ) {
    if (!projectId || entries.length === 0) return false
    setApplyingWorkspaceId(lockId)
    try {
      const proposedValue = proposedValueOverride ?? buildPreProductionWorkspaceContentForEntries(workspace, entries, data, entries.length === 1
        ? `单项提交：${formatPreProductionWorkspaceEntry(entries[0])}`
        : `批量提交：${entries.length} 项`)
      await providerSessionClient.applyWorkspaceArtifact(workspace.id, {
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'workspace',
        },
        currentValue: {
          creativeReferences: data.creativeReferences.length,
          assetSlots: data.assetSlots.length,
        },
        proposedValue,
      })
      await providerSessionClient.updateWorkspaceArtifact(workspace.id, {
        metadata: metadataWithAppliedEntries(workspace, entries.map((entry) => entry.key)),
      })
      toast.success(entries.length === 1 ? '已提交此项' : '工作区已提交')
      await onApplied?.()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '工作区应用失败')
      return false
    } finally {
      setApplyingWorkspaceId(null)
    }
  }

  async function applyEntry(workspace: WorkspaceArtifact, entry: PreProductionWorkspaceEntry) {
    try {
      const proposedValue = buildPreProductionWorkspaceContentForEntries(workspace, [entry], data, `单项提交：${formatPreProductionWorkspaceEntry(entry)}`)
      const helperWorkspace = await providerSessionClient.createWorkspaceArtifact({
        projectId,
        kind,
        title: `单项提交 - ${formatPreProductionWorkspaceEntry(entry)}`,
        content: proposedValue,
        source: {
          ...(isRecord(workspace.source) ? workspace.source : {}),
          sourceWorkspaceId: workspace.id,
          sourceEntryKey: entry.key,
          sourceEntryLabel: entry.label,
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'workspace',
        },
        metadata: {
          helperWorkspace: true,
          sourceWorkspaceId: workspace.id,
          sourceEntryKey: entry.key,
        },
      })
      const applied = await applyEntries(helperWorkspace, [entry], workspace.id, proposedValue)
      if (!applied) return
      await providerSessionClient.updateWorkspaceArtifact(workspace.id, {
        metadata: metadataWithAppliedEntries(workspace, [entry.key]),
      })
      markDecision(entry.key, 'submitted')
      await onApplied?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '工作区应用失败')
    }
  }

  async function applyWorkspace(workspace: WorkspaceArtifact, view: PreProductionWorkspaceView) {
    const entries = [
      ...(includeCreativeReferences ? view.creativeReferences : []),
      ...(includeAssetSlots ? view.assetSlots : []),
    ]
    const pendingEntries = entries.filter((entry) => decisions[entry.key] !== 'rejected' && !entry.applied && entry.changeType !== 'unchanged')
    if (pendingEntries.length === 0) {
      toast.error('没有可提交的变更')
      return
    }
    await applyEntries(workspace, pendingEntries)
  }

  return (
    <ReviewWorkspaceShell
      kind={kind}
      title={title}
      description={description}
      icon={GitBranch}
      countLabel={`${reviewableWorkspaces.length} 项`}
    >
      <ReviewWorkspaceArtifactList>
        {loading ? <ProjectWorkspaceReviewLoadingState text="读取审阅工作区..." /> : null}
        {!loading && reviewableWorkspaces.length === 0 ? <ProjectWorkspaceReviewEmptyText>{emptyMessage}</ProjectWorkspaceReviewEmptyText> : null}
        {reviewableWorkspaces.map((workspace) => {
          const view = parsePreProductionWorkspaceArtifact(workspace, data, { includeCreativeReferences, includeAssetSlots })
          const entries = view ? [...view.creativeReferences, ...view.assetSlots] : []
          const diffEntries = entries.filter((entry) => entry.changeType !== 'unchanged')
          const pendingEntries = entries.filter((entry) => decisions[entry.key] !== 'rejected' && !entry.applied && entry.changeType !== 'unchanged')
          const submittedEntries = entries.filter((entry) => decisions[entry.key] === 'submitted' || entry.applied)
          const rejectedEntries = entries.filter((entry) => decisions[entry.key] === 'rejected')
          const addedEntries = entries.filter((entry) => entry.changeType === 'added')
          const modifiedEntries = entries.filter((entry) => entry.changeType === 'modified')
          const deletedEntries = entries.filter((entry) => entry.changeType === 'deleted')
          return (
            <ReviewWorkspaceArtifactPanel
              key={workspace.id}
              title={workspace.title}
              meta={`${formatDate(workspace.updatedAt)} · ${workspace.id}`}
              badges={
                <>
                  <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceArtifactStatusRecipe(workspace.status)}>{workspace.status}</ProjectWorkspaceReviewStatusBadge>
                  <ProjectWorkspaceReviewBadge variant="outline">{diffEntries.length} 条变更</ProjectWorkspaceReviewBadge>
                </>
              }
            >
              {view ? (
                <>
                  <ReviewWorkspaceSummaryCallout
                    summary={view.summary}
                    badges={
                      <>
                        <ProjectWorkspaceReviewBadge>{addedEntries.length} 新增</ProjectWorkspaceReviewBadge>
                        <ProjectWorkspaceReviewBadge variant="outline">{modifiedEntries.length} 修改</ProjectWorkspaceReviewBadge>
                        <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceCountRecipe('deleted')}>{deletedEntries.length} 删除</ProjectWorkspaceReviewStatusBadge>
                        <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceCountRecipe('submitted')}>{submittedEntries.length} 已提交</ProjectWorkspaceReviewStatusBadge>
                        {rejectedEntries.length > 0 ? <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceCountRecipe('rejected')}>{rejectedEntries.length} 已忽略</ProjectWorkspaceReviewStatusBadge> : null}
                      </>
                    }
                    actions={
                      <>
                      <ProjectWorkspaceReviewActionButton
                        size="xs"
                        variant="outline"
                        onClick={() => setDecisions((current) => {
                          const next = { ...current }
                          for (const entry of entries) delete next[entry.key]
                          return next
                        })}
                      >
                        重置状态
                      </ProjectWorkspaceReviewActionButton>
                      <ProjectWorkspaceReviewActionButton
                        size="xs"
                        loading={applyingWorkspaceId === workspace.id}
                        disabled={workspace.status === 'applied' || pendingEntries.length === 0}
                        onClick={() => void applyWorkspace(workspace, view)}
                      >
                        <CheckCircle2 size={12} />
                        提交剩余
                      </ProjectWorkspaceReviewActionButton>
                      </>
                    }
                  />

                  {diffEntries.length > 0 ? (
                    <ReviewWorkspaceArtifactList>
                      {diffEntries.map((entry) => {
                        const rows = buildPreProductionWorkspaceEntryDiffRows(entry, data, referenceLabels)
                        const isSubmitted = entry.applied || decisions[entry.key] === 'submitted'
                        const isRejected = decisions[entry.key] === 'rejected'
                        return (
                          <ProjectWorkspaceReviewEntryCallout key={entry.key} change={entry.changeType}>
                            <ReviewWorkspaceEntryHeader
                              title={formatPreProductionWorkspaceEntry(entry)}
                              badges={
                                <>
                                  <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceEntryChangeRecipe(entry.changeType)} size="micro">
                                    {entry.changeType === 'deleted' ? <Trash2 size={10} /> : null}
                                    {preProductionWorkspaceEntryChangeLabel(entry)}
                                  </ProjectWorkspaceReviewStatusBadge>
                                  {entry.inferred ? <ProjectWorkspaceReviewBadge variant="outline" size="micro">缺席推断</ProjectWorkspaceReviewBadge> : null}
                                  <ProjectWorkspaceReviewBadge variant="outline" size="micro">{preProductionWorkspaceEntryLabel(entry)}</ProjectWorkspaceReviewBadge>
                                  {isSubmitted ? <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceDecisionRecipe('submitted')} size="micro">已提交</ProjectWorkspaceReviewStatusBadge> : null}
                                  {isRejected ? <ProjectWorkspaceReviewStatusBadge {...preProductionWorkspaceDecisionRecipe('rejected')} size="micro">已忽略</ProjectWorkspaceReviewStatusBadge> : null}
                                </>
                              }
                              actions={
                                <>
                                {isSubmitted ? null : (
                                  <ProjectWorkspaceReviewActionButton
                                    size="xs"
                                    loading={applyingWorkspaceId === workspace.id}
                                    disabled={workspace.status === 'applied' || entry.changeType === 'unchanged'}
                                    onClick={() => void applyEntry(workspace, entry)}
                                  >
                                    提交此项
                                  </ProjectWorkspaceReviewActionButton>
                                )}
                                {isRejected ? (
                                  <ProjectWorkspaceReviewActionButton size="xs" variant="outline" onClick={() => clearDecision(entry.key)}>
                                    恢复
                                  </ProjectWorkspaceReviewActionButton>
                                ) : (
                                  <ProjectWorkspaceReviewActionButton size="xs" variant="outline" onClick={() => markDecision(entry.key, 'rejected')}>
                                    忽略
                                  </ProjectWorkspaceReviewActionButton>
                                )}
                                </>
                              }
                            />
                            <ProjectWorkspaceReviewDetailText>{entry.detail}</ProjectWorkspaceReviewDetailText>

                            {rows.length > 0 ? (
                              <ReviewWorkspaceFieldDiffList>
                                {rows.map((row, index) => (
                                  <ReviewWorkspaceFieldDiffRow
                                    key={`${entry.key}-${row.label}-${index}`}
                                    label={row.label}
                                    before={row.before}
                                    after={row.after}
                                    change={row.changeType === 'added' ? 'added' : row.changeType === 'deleted' ? 'deleted' : 'unchanged'}
                                  />
                                ))}
                              </ReviewWorkspaceFieldDiffList>
                            ) : (
                              <ProjectWorkspaceReviewEmptyText>
                                没有可展示的字段差异。
                              </ProjectWorkspaceReviewEmptyText>
                            )}
                          </ProjectWorkspaceReviewEntryCallout>
                        )
                      })}
                    </ReviewWorkspaceArtifactList>
                  ) : (
                    <ProjectWorkspaceReviewEmptyText>
                      这份工作区没有可展示的 diff。
                    </ProjectWorkspaceReviewEmptyText>
                  )}

                  {view.impactNotes.length > 0 ? (
                    <ProjectWorkspaceReviewCallout tone="neutral" compact title="影响说明">
                      <ProjectWorkspaceReviewNoteList notes={view.impactNotes} itemKeyPrefix={`${workspace.id}-impact`} />
                    </ProjectWorkspaceReviewCallout>
                  ) : null}
                </>
              ) : (
                <ProjectWorkspaceReviewEmptyText>
                  无法解析这份工作区的差异。
                </ProjectWorkspaceReviewEmptyText>
              )}
            </ReviewWorkspaceArtifactPanel>
          )
        })}

      </ReviewWorkspaceArtifactList>
    </ReviewWorkspaceShell>
  )
}

function isHelperWorkspace(workspace: WorkspaceArtifact) {
  const metadata = isRecord(workspace.metadata) ? workspace.metadata : {}
  return typeof metadata.sourceWorkspaceId === 'string' && metadata.sourceWorkspaceId.trim().length > 0
}

function formatDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
