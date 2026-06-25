import type { AgentRun, AgentRunStep, AgentTraceEvent } from '@movscript/agent-protocol'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionRuntimeModel'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionTaskModel'

export type AgentSessionGenerationRecordKind = 'generation' | 'candidate' | 'workspace' | 'tool' | 'run'

export interface AgentSessionGenerationRecord {
  id: string
  kind: AgentSessionGenerationRecordKind
  title: string
  description?: string
  status?: string
  contentUnitId?: string
  candidateId?: string
  resourceId?: number
  runId?: string
  threadId?: string
  createdAt: string
  updatedAt?: string
}

export interface AgentSessionGenerationProjection {
  records: AgentSessionGenerationRecord[]
  contentUnitIds: string[]
}

export function buildAgentSessionGenerationProjection(input: {
  conversationId: string
  pageTasks: AgentPageTaskState[]
  runtimeState?: AgentConversationRuntimeState
  providerThreadId?: string
  externalRuns?: AgentRun[]
}): AgentSessionGenerationProjection {
  const runs = uniqueRuns([
    ...input.pageTasks.flatMap((task) => runFromPageTask(task)),
    ...(input.runtimeState?.run ? [input.runtimeState.run] : []),
    ...(input.externalRuns ?? []),
  ])
  const contentUnitIds = new Set<string>()
  const records = new Map<string, AgentSessionGenerationRecord>()

  for (const task of input.pageTasks) {
    for (const artifact of task.artifacts ?? []) {
      collectContentUnitIds(artifact, contentUnitIds)
      const record = generationRecordFromArtifact(task, artifact)
      if (record) records.set(record.id, record)
    }
  }

  for (const run of runs) {
    collectContentUnitIds(run, contentUnitIds)
    records.set(`run:${run.id}`, {
      id: `run:${run.id}`,
      kind: 'run',
      title: runStatusTitle(run.status),
      description: run.error ?? run.warnings?.[0],
      status: run.status,
      runId: run.id,
      threadId: run.threadId,
      createdAt: run.startedAt ?? run.createdAt,
      updatedAt: run.completedAt ?? run.failedAt ?? run.cancelledAt ?? run.updatedAt,
    })

    for (const step of run.steps) {
      collectContentUnitIds(step, contentUnitIds)
      const record = generationRecordFromStep(run, step)
      if (record) records.set(record.id, record)
    }

    for (const trace of run.traceEvents ?? []) {
      collectContentUnitIds(trace, contentUnitIds)
      const record = generationRecordFromTrace(run, trace)
      if (record) records.set(record.id, record)
    }
  }

  return {
    records: Array.from(records.values()).sort(compareRecordsByTime),
    contentUnitIds: Array.from(contentUnitIds).sort((left, right) => left.localeCompare(right)),
  }
}

export function conversationPageTasks(input: {
  conversationId: string
  pageTasks: Record<string, AgentPageTaskState>
  providerThreadId?: string
}): AgentPageTaskState[] {
  return Object.values(input.pageTasks)
    .filter((task) => {
      if (task.conversationId === input.conversationId) return true
      if (input.providerThreadId && task.threadId === input.providerThreadId) return true
      if (input.providerThreadId && task.run?.threadId === input.providerThreadId) return true
      return false
    })
    .sort((left, right) => left.createdAt - right.createdAt)
}

function runFromPageTask(task: AgentPageTaskState): AgentRun[] {
  if (!task.run || !('steps' in task.run)) return []
  return [task.run]
}

function uniqueRuns(runs: AgentRun[]): AgentRun[] {
  const byId = new Map<string, AgentRun>()
  for (const run of runs) byId.set(run.id, run)
  return Array.from(byId.values())
}

function generationRecordFromArtifact(
  task: AgentPageTaskState,
  artifact: AgentTaskArtifactRef,
): AgentSessionGenerationRecord | undefined {
  const contentUnitId = firstContentUnitId(artifact)
  return {
    id: `artifact:${task.requestId}:${artifact.workspaceId}`,
    kind: 'workspace',
    title: artifact.title ?? workspaceKindTitle(artifact.workspaceKind) ?? '生成工作区产物',
    description: [
      artifact.workspaceKind,
      artifact.filePath,
      contentUnitId ? `content unit ${contentUnitId}` : undefined,
    ].filter(Boolean).join(' · ') || undefined,
    status: task.status,
    ...(contentUnitId ? { contentUnitId } : {}),
    runId: artifact.sourceRunId ?? task.runId,
    threadId: artifact.sourceThreadId ?? task.threadId,
    createdAt: artifact.updatedAt ?? new Date(task.updatedAt).toISOString(),
  }
}

function generationRecordFromStep(run: AgentRun, step: AgentRunStep): AgentSessionGenerationRecord | undefined {
  if (step.type !== 'tool_call') return undefined
  const toolName = step.toolName ?? step.title ?? ''
  if (!isGenerationRelatedTool(toolName)) return undefined
  const contentUnitId = firstContentUnitId(step)
  const candidateId = firstIdByKeys(step, ['candidateId', 'candidate_id'])
  const resourceId = firstNumberByKeys(step, ['resourceId', 'resource_id', 'outputResourceId', 'output_resource_id'])
  return {
    id: `step:${step.id}`,
    kind: toolName.includes('candidate') ? 'candidate' : 'tool',
    title: toolTitle(toolName),
    description: step.error ?? compactStepDescription(step),
    status: step.status,
    ...(contentUnitId ? { contentUnitId } : {}),
    ...(candidateId ? { candidateId } : {}),
    ...(resourceId !== undefined ? { resourceId } : {}),
    runId: run.id,
    threadId: run.threadId,
    createdAt: step.createdAt,
    updatedAt: step.completedAt,
  }
}

function generationRecordFromTrace(run: AgentRun, trace: AgentTraceEvent): AgentSessionGenerationRecord | undefined {
  const data = isRecord(trace.data) ? trace.data : undefined
  const generation = isRecord(data?.generation) ? data.generation : undefined
  if (!generation) return undefined
  const contentUnitId = firstContentUnitId(trace)
  const candidateId = firstIdByKeys(trace, ['candidateId', 'candidate_id'])
  const resourceId = firstNumberByKeys(generation, ['outputResourceId', 'output_resource_id', 'resourceId', 'resource_id'])
  const outputResourceIds = Array.isArray(generation.outputResourceIds)
    ? generation.outputResourceIds
    : Array.isArray(generation.output_resource_ids)
      ? generation.output_resource_ids
      : []
  const firstResourceId = resourceId ?? outputResourceIds.map(numberValue).find((value) => value !== undefined)
  return {
    id: `trace:${trace.id}`,
    kind: 'generation',
    title: stringValue(generation.message) ?? stringValue(trace.title) ?? '生成任务',
    description: [
      stringValue(generation.providerName),
      stringValue(generation.modelDisplay ?? generation.modelIdentifier),
      firstResourceId !== undefined ? `resource #${firstResourceId}` : undefined,
    ].filter(Boolean).join(' · ') || undefined,
    status: stringValue(generation.status) ?? trace.status,
    ...(contentUnitId ? { contentUnitId } : {}),
    ...(candidateId ? { candidateId } : {}),
    ...(firstResourceId !== undefined ? { resourceId: firstResourceId } : {}),
    runId: run.id,
    threadId: run.threadId,
    createdAt: trace.createdAt,
    updatedAt: trace.completedAt,
  }
}

function collectContentUnitIds(value: unknown, ids: Set<string>) {
  for (const id of contentUnitIdsFromValue(value)) ids.add(id)
}

function firstContentUnitId(value: unknown): string | undefined {
  return contentUnitIdsFromValue(value)[0]
}

function contentUnitIdsFromValue(value: unknown): string[] {
  const ids = new Set<string>()
  scanValue(value, (key, item) => {
    if (!isContentUnitKey(key)) return
    const id = contentUnitIdValue(item)
    if (id) ids.add(normalizeContentUnitId(id))
  })
  return Array.from(ids)
}

function firstIdByKeys(value: unknown, keys: string[]): string | undefined {
  let found: string | undefined
  scanValue(value, (key, item) => {
    if (found || !keys.includes(key)) return
    found = idValue(item)
  })
  return found
}

function firstNumberByKeys(value: unknown, keys: string[]): number | undefined {
  let found: number | undefined
  scanValue(value, (key, item) => {
    if (found !== undefined || !keys.includes(key)) return
    found = numberValue(item)
  })
  return found
}

function scanValue(value: unknown, visit: (key: string, value: unknown) => void, seen = new Set<unknown>()) {
  if (!isRecord(value) && !Array.isArray(value)) return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) scanValue(item, visit, seen)
    return
  }
  for (const [key, item] of Object.entries(value)) {
    visit(key, item)
    if (isRecord(item) || Array.isArray(item)) scanValue(item, visit, seen)
  }
}

function isContentUnitKey(key: string): boolean {
  return key === 'contentUnitId'
    || key === 'content_unit_id'
    || key === 'contentUnit'
    || key === 'content_unit'
    || key === 'contentUnitRef'
    || key === 'content_unit_ref'
}

function normalizeContentUnitId(value: string): string {
  const match = value.match(/content_units\/([^/]+)/)
  return match?.[1] ?? value
}

function isGenerationRelatedTool(toolName: string): boolean {
  return /generation|generate|candidate|content_candidate|content_unit_candidate|domain_create_content|domain_select_content|domain_decide_content/i.test(toolName)
}

function runStatusTitle(status: string): string {
  if (status === 'completed') return '本轮已完成'
  if (status === 'completed_with_warnings') return '本轮已完成，有提示'
  if (status === 'failed') return '本轮失败'
  if (status === 'cancelled') return '本轮已取消'
  if (status === 'requires_action') return '本轮等待用户操作'
  return '本轮进行中'
}

function workspaceKindTitle(kind: string | undefined): string | undefined {
  if (kind === 'content_unit_workspace') return '创作片段工作区'
  if (kind === 'asset_workspace') return '素材工作区'
  if (kind === 'production_workspace') return '制作工作区'
  if (kind === 'project_standards_workspace') return '项目规范工作区'
  return undefined
}

function toolTitle(toolName: string): string {
  if (/select|decide/.test(toolName)) return '创作片段候选决策'
  if (/candidate/.test(toolName)) return '候选记录'
  if (/generation|generate/.test(toolName)) return '生成工具调用'
  return toolName || '工具调用'
}

function compactStepDescription(step: AgentRunStep): string | undefined {
  const contentUnitId = firstContentUnitId(step)
  const candidateId = firstIdByKeys(step, ['candidateId', 'candidate_id'])
  const resourceId = firstNumberByKeys(step, ['resourceId', 'resource_id'])
  return [
    contentUnitId ? `content unit ${contentUnitId}` : undefined,
    candidateId ? `candidate ${candidateId}` : undefined,
    resourceId !== undefined ? `resource #${resourceId}` : undefined,
  ].filter(Boolean).join(' · ') || undefined
}

function compareRecordsByTime(left: AgentSessionGenerationRecord, right: AgentSessionGenerationRecord): number {
  return Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function contentUnitIdValue(value: unknown): string | undefined {
  const direct = idValue(value)
  if (direct) return direct
  if (!isRecord(value)) return undefined
  for (const key of ['id', 'contentUnitId', 'content_unit_id', 'ref', 'path']) {
    const nested = idValue(value[key])
    if (nested) return nested
  }
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
