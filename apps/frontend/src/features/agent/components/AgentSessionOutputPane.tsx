import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleDot, ClipboardList, Loader2, Sparkles } from 'lucide-react'
import { Badge, Button } from '@movscript/ui/primitives'

import { loadContentSourceWorkspaceData, selectContentSourceWorkspaceCandidate } from '@/features/content-source-workspace/application/contentSourceWorkspaceElectron'
import type { ContentSourceWorkspaceData } from '@/features/content-source-workspace/domain/contentSourceWorkspaceData'
import type { PreviewAssetCandidate, PreviewAssetReferenceUnit, PreviewCandidate, PreviewContentUnit, SelectionState } from '@/features/content-source-workspace/domain/sourceWorkspaceTypes'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  buildAgentSessionGenerationProjection,
  conversationPageTasks,
  type AgentSessionGenerationRecord,
} from '@/features/agent/domain/agentSessionGenerationProjection'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import { agentSessionOutputKeys } from '@/features/agent/application/agentSessionOutputQueryKeys'
import { agentSessionOutputContentWorkspaceChangedResult, invalidateAgentSessionOutputMutationResult } from '@/features/agent/application/agentSessionOutputMutationInvalidation'

interface AgentSessionOutputPaneProps {
  conversationId: string
  projectId?: number
}

interface SessionContentUnitView {
  id: string
  title: string
  type: string
  outputKind: string
  path: string
  editPrompt: string
  selectionState: SelectionState
  candidates: SessionCandidateView[]
}

interface SessionCandidateView {
  id: string
  title: string
  model: string
  note: string
  selected?: boolean
  resourceId?: number
}

export function AgentSessionOutputPane({ conversationId, projectId }: AgentSessionOutputPaneProps) {
  const pageTasksById = useAgentSessionStore((state) => state.pageTasks)
  const threadBinding = useAgentSessionStore((state) => state.conversationThreadBindings[conversationId])
  const runtimeState = useAgentSessionStore((state) => state.conversationRuntimeStates[conversationId])
  const [selectingCandidateKey, setSelectingCandidateKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const pageTasks = useMemo(() => conversationPageTasks({
    conversationId,
    pageTasks: pageTasksById,
    providerThreadId: threadBinding?.providerThreadId,
  }), [conversationId, pageTasksById, threadBinding?.providerThreadId])
  const providerThreadId = threadBinding?.providerThreadId?.trim()
  const providerSessionTreeId = threadBinding?.providerSessionTreeId?.trim()
  const providerThreadRunsQuery = useQuery({
    queryKey: agentSessionOutputKeys.threadRuns(providerSessionClient.baseURL, providerSessionTreeId, providerThreadId),
    queryFn: () => {
      const client = providerSessionTreeId
        ? providerSessionClient.forSession({ sessionId: providerSessionTreeId })
        : providerSessionClient
      return client.listRunsByThread(providerThreadId!)
    },
    enabled: Boolean(providerThreadId),
    retry: false,
  })
  const projection = useMemo(() => buildAgentSessionGenerationProjection({
    conversationId,
    pageTasks,
    runtimeState,
    providerThreadId: threadBinding?.providerThreadId,
    externalRuns: providerThreadRunsQuery.data?.runs,
  }), [conversationId, pageTasks, providerThreadRunsQuery.data?.runs, runtimeState, threadBinding?.providerThreadId])
  const contentWorkspaceQuery = useQuery<ContentSourceWorkspaceData>({
    queryKey: agentSessionOutputKeys.contentWorkspace(projectId),
    queryFn: () => loadContentSourceWorkspaceData(projectId!),
    enabled: projectId !== undefined,
  })
  const contentUnits = useMemo(() => (
    sessionContentUnitsFromWorkspaceData(contentWorkspaceQuery.data, new Set(projection.contentUnitIds))
  ), [contentWorkspaceQuery.data, projection.contentUnitIds])

  async function selectCandidate(contentUnit: SessionContentUnitView, candidate: SessionCandidateView) {
    if (!projectId) return
    const key = `${contentUnit.id}:${candidate.id}`
    setSelectingCandidateKey(key)
    setActionError(null)
    try {
      await selectContentSourceWorkspaceCandidate({
        projectId,
        contentUnitId: contentUnit.id,
        candidateId: candidate.id,
        ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
      })
      await invalidateAgentSessionOutputMutationResult(queryClient, agentSessionOutputContentWorkspaceChangedResult({ projectId, changedIds: [contentUnit.id, candidate.id] }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setSelectingCandidateKey(null)
    }
  }

  return (
    <div className="agent-session-output">
      <section className="agent-session-output__header">
        <div className="agent-session-output__header-copy">
          <p className="agent-session-output__eyebrow">
            <ClipboardList size={13} />
            会话产出
          </p>
          <h2>生成记录与内容单元决策</h2>
          <p>从当前会话可见的运行结果整理生成记录，并聚合相关内容单元的候选。</p>
        </div>
        <div className="agent-session-output__stats" aria-label="会话产出统计">
          <span><strong>{projection.records.length}</strong> 记录</span>
          <span><strong>{contentUnits.length}</strong> 内容单元</span>
        </div>
      </section>

      {actionError ? (
        <div className="agent-session-output__error" role="alert">
          {actionError}
        </div>
      ) : null}

      <section className="agent-session-output__section">
        <div className="agent-session-output__section-title">
          <Sparkles size={14} />
          <span>生成记录</span>
        </div>
        {projection.records.length === 0 ? (
          <EmptySessionOutput message="当前会话暂未识别到生成记录。" />
        ) : (
          <div className="agent-session-output__record-list">
            {projection.records.map((record) => (
              <GenerationRecordRow key={record.id} record={record} />
            ))}
          </div>
        )}
      </section>

      <section className="agent-session-output__section">
        <div className="agent-session-output__section-title">
          <CircleDot size={14} />
          <span>涉及的内容单元</span>
          {contentWorkspaceQuery.isLoading ? <Loader2 className="agent-session-output__spin" size={13} /> : null}
        </div>
        {!projectId ? (
          <EmptySessionOutput message="当前会话没有绑定项目，无法读取内容单元候选。" />
        ) : contentWorkspaceQuery.isError ? (
          <EmptySessionOutput message={contentWorkspaceQuery.error instanceof Error ? contentWorkspaceQuery.error.message : '读取内容单元失败。'} />
        ) : contentWorkspaceQuery.isLoading ? (
          <EmptySessionOutput message="正在读取内容单元候选..." />
        ) : contentUnits.length === 0 ? (
          <EmptySessionOutput message="当前会话暂未识别到关联内容单元。" />
        ) : (
          <div className="agent-session-output__unit-list">
            {contentUnits.map((unit) => (
              <ContentUnitDecisionCard
                key={unit.id}
                unit={unit}
                selectingCandidateKey={selectingCandidateKey}
                onSelect={selectCandidate}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function GenerationRecordRow({ record }: { record: AgentSessionGenerationRecord }) {
  return (
    <article className="agent-session-output__record">
      <div className="agent-session-output__record-main">
        <p className="agent-session-output__record-title">{record.title}</p>
        {record.description ? <p className="agent-session-output__record-description">{record.description}</p> : null}
        <p className="agent-session-output__record-meta">
          {[
            record.contentUnitId ? `content unit ${record.contentUnitId}` : undefined,
            record.candidateId ? `candidate ${record.candidateId}` : undefined,
            record.resourceId !== undefined ? `resource #${record.resourceId}` : undefined,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Badge variant="outline">{record.status ?? record.kind}</Badge>
    </article>
  )
}

function ContentUnitDecisionCard({
  unit,
  selectingCandidateKey,
  onSelect,
}: {
  unit: SessionContentUnitView
  selectingCandidateKey: string | null
  onSelect: (unit: SessionContentUnitView, candidate: SessionCandidateView) => void
}) {
  return (
    <article className="agent-session-output__unit">
      <header className="agent-session-output__unit-header">
        <div>
          <p className="agent-session-output__unit-title">{unit.title}</p>
          <p className="agent-session-output__unit-meta">{unit.id} · {unit.type} · {unit.outputKind}</p>
        </div>
        <Badge variant={unit.selectionState === 'selected' ? 'outline' : 'soft'}>{selectionStateText(unit.selectionState)}</Badge>
      </header>
      {unit.editPrompt ? <p className="agent-session-output__unit-prompt">{unit.editPrompt}</p> : null}
      {unit.candidates.length === 0 ? (
        <p className="agent-session-output__candidate-empty">还没有候选。</p>
      ) : (
        <div className="agent-session-output__candidate-list">
          {unit.candidates.map((candidate) => {
            const key = `${unit.id}:${candidate.id}`
            const selecting = selectingCandidateKey === key
            return (
              <div key={candidate.id} className="agent-session-output__candidate" data-selected={candidate.selected ? 'true' : undefined}>
                <div className="agent-session-output__candidate-copy">
                  <p className="agent-session-output__candidate-title">
                    {candidate.selected ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                    {candidate.title}
                  </p>
                  <p className="agent-session-output__candidate-meta">
                    {[candidate.id, candidate.model, candidate.resourceId !== undefined ? `resource #${candidate.resourceId}` : undefined].filter(Boolean).join(' · ')}
                  </p>
                  {candidate.note ? <p className="agent-session-output__candidate-note">{candidate.note}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant={candidate.selected ? 'outline' : 'solid'}
                  disabled={candidate.selected || selecting}
                  onClick={() => onSelect(unit, candidate)}
                >
                  {selecting ? '选择中' : candidate.selected ? '已选择' : '选择'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

function EmptySessionOutput({ message }: { message: string }) {
  return (
    <div className="agent-session-output__empty">
      {message}
    </div>
  )
}

function sessionContentUnitsFromWorkspaceData(
  data: ContentSourceWorkspaceData | undefined,
  contentUnitIds: Set<string>,
): SessionContentUnitView[] {
  if (!data || contentUnitIds.size === 0) return []
  const units = new Map<string, SessionContentUnitView>()
  for (const moment of data.previewMoments) {
    for (const shot of moment.shots) {
      const unit = contentUnitViewFromPreviewUnit(shot.contentUnit, shot.title)
      if (contentUnitIds.has(unit.id)) units.set(unit.id, unit)
    }
  }
  for (const assetUnit of Object.values(data.assetReferenceUnits)) {
    const unit = contentUnitViewFromAssetUnit(assetUnit)
    if (contentUnitIds.has(unit.id)) units.set(unit.id, unit)
  }
  return Array.from(units.values()).sort((left, right) => left.title.localeCompare(right.title))
}

function contentUnitViewFromPreviewUnit(unit: PreviewContentUnit, ownerTitle: string): SessionContentUnitView {
  return {
    id: unit.id,
    title: ownerTitle || unit.id,
    type: unit.type,
    outputKind: unit.outputKind,
    path: unit.path,
    editPrompt: unit.editPrompt,
    selectionState: unit.selectionState,
    candidates: unit.candidates.map(candidateViewFromPreviewCandidate),
  }
}

function contentUnitViewFromAssetUnit(unit: PreviewAssetReferenceUnit): SessionContentUnitView {
  return {
    id: unit.contentUnitId,
    title: unit.title || unit.contentUnitId,
    type: unit.contentUnitType,
    outputKind: unit.outputKind,
    path: unit.path,
    editPrompt: unit.editPrompt,
    selectionState: unit.selectionState,
    candidates: unit.candidates.map(candidateViewFromAssetCandidate),
  }
}

function candidateViewFromPreviewCandidate(candidate: PreviewCandidate): SessionCandidateView {
  return {
    id: candidate.id,
    title: candidate.title || candidate.id,
    model: candidate.model,
    note: candidate.note,
    selected: candidate.selected,
  }
}

function candidateViewFromAssetCandidate(candidate: PreviewAssetCandidate): SessionCandidateView {
  return {
    ...candidateViewFromPreviewCandidate(candidate),
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
  }
}

function selectionStateText(status: SelectionState) {
  if (status === 'selected') return '已选择'
  if (status === 'stale') return '需复核'
  if (status === 'needs_candidate') return '缺候选'
  return '待选择'
}
