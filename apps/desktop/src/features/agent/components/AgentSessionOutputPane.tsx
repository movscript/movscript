import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, CircleDot, ClipboardList, Loader2, Sparkles } from 'lucide-react'

import { selectContentSourceWorkspaceCandidate } from '@movscript/project-surface/data'
import { useAgentConversationRuntimeState } from '@/features/agent/state/agentConversationRuntimeStore'
import { useAgentConversationThreadBinding } from '@/features/agent/state/agentConversationRegistryStore'
import { useAgentPageTasks } from '@/features/agent/state/agentTaskQueueStore'
import {
  buildAgentSessionGenerationProjection,
  conversationPageTasks,
} from '@/features/agent/domain/agentSessionGenerationProjection'
import { agentSessionOutputKeys } from '@/features/agent/application/agentSessionOutputQueryKeys'
import { listAgentSessionThreadRuns } from '@/features/agent/application/agentSessionOutputService'
import { agentSessionOutputContentWorkspaceChangedResult, invalidateAgentSessionOutputMutationResult } from '@/features/agent/application/agentSessionOutputMutationInvalidation'
import {
  agentActivityEventMatches,
  publishAgentActivityEvent,
  recentAgentActivityEvents,
  subscribeAgentActivityEvents,
  type AgentActivityAppEvent,
} from '@/features/agent/application/agentActivityEvents'
import {
  sessionContentUnitsFromReadModel,
  type SessionCandidateView,
  type SessionContentUnitView,
} from './AgentSessionOutputModel'
import {
  AgentActivityRow,
  ContentUnitDecisionCard,
  EmptySessionOutput,
  GenerationRecordRow,
} from './AgentSessionOutputPaneParts'
import {
  getDaemonGatewayBaseURL,
  getRuntimeConfigSnapshot,
  refreshRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'
import type { Project } from '@/types'

const PROJECT_CONTENT_UNITS_READ_MODEL_ENDPOINT = '/v1/project/content-units/read-model'

interface AgentSessionOutputPaneProps {
  conversationId: string
  project?: Project | null
}

export function AgentSessionOutputPane({ conversationId, project = null }: AgentSessionOutputPaneProps) {
  const projectId = positiveInteger(project?.ID)
  const projectDir = project?.workspace_path || project?.project_path
  const ownerContext = useMemo(() => ({
    ...(projectDir ? { projectDir } : {}),
    ...(project?.project_uid ? { projectUid: project.project_uid } : {}),
  }), [project?.project_uid, projectDir])
  const pageTasksById = useAgentPageTasks()
  const threadBinding = useAgentConversationThreadBinding(conversationId)
  const runtimeState = useAgentConversationRuntimeState(conversationId)
  const [selectingCandidateKey, setSelectingCandidateKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activityEvents, setActivityEvents] = useState<AgentActivityAppEvent[]>(() => recentAgentActivityEvents({ conversationId, projectId, limit: 12 }))
  const queryClient = useQueryClient()
  const pageTasks = useMemo(() => conversationPageTasks({
    conversationId,
    pageTasks: pageTasksById,
    providerThreadId: threadBinding?.providerThreadId,
  }), [conversationId, pageTasksById, threadBinding?.providerThreadId])
  const providerThreadId = threadBinding?.providerThreadId?.trim()
  const providerSessionTreeId = threadBinding?.providerSessionTreeId?.trim()
  const providerThreadRunsQuery = useQuery({
    queryKey: agentSessionOutputKeys.threadRuns(providerSessionTreeId, providerThreadId),
    queryFn: () => listAgentSessionThreadRuns({
      providerSessionTreeId,
      providerThreadId: providerThreadId!,
    }),
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
  const projectedContentUnitIds = projection.contentUnitIds
  const contentUnitsQuery = useQuery({
    queryKey: agentSessionOutputKeys.contentUnits(projectId, projectedContentUnitIds),
    queryFn: () => loadAgentSessionOutputContentUnits({
      projectId: projectId!,
      projectDir: projectDir!,
      projectUid: project?.project_uid,
      contentUnitIds: projectedContentUnitIds,
    }),
    enabled: projectId !== undefined && Boolean(projectDir) && projectedContentUnitIds.length > 0,
  })
  const contentUnits = contentUnitsQuery.data ?? []
  useEffect(() => {
    const filter = { conversationId, projectId }
    setActivityEvents(recentAgentActivityEvents({ ...filter, limit: 12 }))
    return subscribeAgentActivityEvents((event) => {
      setActivityEvents((current) => {
        const next = [...current.filter((item) => item.id !== event.id), event]
        return next.slice(-12)
      })
    }, (event) => agentActivityEventMatches(event, filter))
  }, [conversationId, projectId])

  async function selectCandidate(contentUnit: SessionContentUnitView, candidate: SessionCandidateView) {
    if (!projectId) return
    const key = `${contentUnit.id}:${candidate.id}`
    setSelectingCandidateKey(key)
    setActionError(null)
    try {
      await selectContentSourceWorkspaceCandidate({
        projectId,
        ownerContext,
        contentUnitId: contentUnit.id,
        candidateId: candidate.id,
        ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
      })
      publishAgentActivityEvent('agent.output.selected', {
        conversationId,
        projectId,
        activityId: `${contentUnit.id}:${candidate.id}:selected`,
        kind: 'output',
        title: '候选已选用',
        summary: `${contentUnit.title} · ${candidate.title}`,
        status: 'completed',
        origin: 'user',
        targetIds: [contentUnit.id, candidate.id],
        rawRef: { type: 'content_unit_candidate', id: `${contentUnit.id}:${candidate.id}` },
      }, {
        id: `agent:output-selected:${conversationId}:${projectId}:${contentUnit.id}:${candidate.id}`,
        source: 'agent-session-output-pane',
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
          <h2>生成记录与创作片段决策</h2>
          <p>从当前会话可见的运行结果整理生成记录，并聚合相关创作片段的候选。</p>
        </div>
        <div className="agent-session-output__stats" aria-label="会话产出统计">
          <span><strong>{projection.records.length}</strong> 记录</span>
          <span><strong>{contentUnits.length}</strong> 创作片段</span>
        </div>
      </section>

      {actionError ? (
        <div className="agent-session-output__error" role="alert">
          {actionError}
        </div>
      ) : null}

      <section className="agent-session-output__section">
        <div className="agent-session-output__section-title">
          <Activity size={14} />
          <span>行为时间线</span>
        </div>
        {activityEvents.length === 0 ? (
          <EmptySessionOutput message="当前会话暂未记录到 agent 行为。" />
        ) : (
          <div className="agent-session-output__activity-list">
            {activityEvents.map((event) => (
              <AgentActivityRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

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
          <span>涉及的创作片段</span>
          {contentUnitsQuery.isLoading ? <Loader2 className="agent-session-output__spin" size={13} /> : null}
        </div>
        {!projectId ? (
          <EmptySessionOutput message="当前会话没有绑定项目，无法读取创作片段候选。" />
        ) : !projectDir ? (
          <EmptySessionOutput message="当前项目没有本地工作区，无法读取创作片段候选。" />
        ) : contentUnitsQuery.isError ? (
          <EmptySessionOutput message={contentUnitsQuery.error instanceof Error ? contentUnitsQuery.error.message : '读取创作片段失败。'} />
        ) : contentUnitsQuery.isLoading ? (
          <EmptySessionOutput message="正在读取创作片段候选..." />
        ) : contentUnits.length === 0 ? (
          <EmptySessionOutput message="当前会话暂未识别到关联创作片段。" />
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

async function loadAgentSessionOutputContentUnits(input: {
  projectId: number
  projectDir: string
  projectUid?: string
  contentUnitIds: string[]
}): Promise<SessionContentUnitView[]> {
  if (input.contentUnitIds.length === 0) return []
  const runtimeConfig = await refreshRuntimeConfigSnapshot().catch(() => null)
  const snapshot = runtimeConfig ?? getRuntimeConfigSnapshot()
  const baseURL = agentOutputProjectServiceBaseURL(snapshot)
  const response = await fetch(`${baseURL}${PROJECT_CONTENT_UNITS_READ_MODEL_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      projectDir: input.projectDir,
      contentUnitIds: input.contentUnitIds,
      ...(input.projectUid ? { projectUid: input.projectUid } : {}),
      ...agentOutputRuntimeEnvelope(snapshot),
    }),
  })
  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    const record = recordValue(payload) ?? {}
    throw new Error(stringValue(record.message) ?? stringValue(record.error) ?? `读取创作片段失败：${response.status}`)
  }
  return sessionContentUnitsFromReadModel(payload)
}

function agentOutputProjectServiceBaseURL(runtimeConfig: unknown): string {
  const record = recordValue(runtimeConfig) ?? {}
  const runtimeConnection = recordValue(record.runtimeConnection)
  const runtime = recordValue(record.runtime)
  const runtimeGateway = recordValue(runtime?.gateway)
  const baseURL = stringValue(runtimeConnection?.gatewayBaseURL)
    ?? stringValue(runtimeGateway?.baseURL)
    ?? stringValue(record.gatewayBaseURL)
    ?? stringValue(record.daemonGatewayBaseURL)
    ?? getDaemonGatewayBaseURL()
  return baseURL.replace(/\/+$/, '')
}

function agentOutputRuntimeEnvelope(runtimeConfig: unknown): Record<string, unknown> {
  const record = recordValue(runtimeConfig) ?? {}
  const movScriptHomeDir = stringValue(record.movScriptHomeDir ?? record.movscript_home_dir ?? record.workspaceDir ?? record.workspace_dir)
  return movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}
}

function positiveInteger(value: string | number | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}
