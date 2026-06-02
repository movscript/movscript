import {
  AGENT_TRACE_EVENT_KINDS,
  type AgentThreadListPage,
  type AgentThreadSummary,
  type AgentTraceEventKind,
  type AgentTraceQuery,
} from '@movscript/protocol'
import type { AgentRuntimeRouter } from '../../../application/router/runtimeRouter.js'
import type { RuntimeDebugEvidenceRefQuery } from '../../../application/read/trace/runtimeTraceReadBridge.js'
import { installAgentPack, uninstallAgentPack, type AgentPackFile } from '../../../catalog/loading/install/packInstaller.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import { normalizeDraftKind, normalizeDraftStatus } from '../../../drafts/store/draftStore.js'
import { isValidMemoryProjectId } from '../../../memory/shared/types.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { AgentHTTPError } from '../../core/http.js'

export function normalizeDraftBody(body: unknown): Record<string, JSONValue> {
  if (!isRecord(body)) throw new AgentHTTPError(400, 'draft body must be an object')
  const projectId = normalizeDraftBodyProjectId(body.projectId)
  return {
    ...(projectId !== undefined ? { projectId } : {}),
    kind: normalizeDraftKind(body.kind),
    title: typeof body.title === 'string' ? body.title : 'Untitled draft',
    content: typeof body.content === 'string' ? body.content : '',
    ...(isRecord(body.source) ? { source: normalizeDraftSource(body.source) } : {}),
    ...(isRecord(body.target) ? { target: body.target as Record<string, JSONValue> } : {}),
    ...(isRecord(body.metadata) ? { metadata: body.metadata as Record<string, JSONValue> } : {}),
  }
}

export function normalizeDraftQuery(url: URL): Parameters<AgentRuntimeRouter['listDrafts']>[0] {
  const projectId = url.searchParams.get('projectId')
  const parsedProjectId = parseOptionalProjectIdParam(projectId)
  const kind = normalizeDraftKind(url.searchParams.get('kind'))
  const status = normalizeDraftStatus(url.searchParams.get('status'))
  const statuses = url.searchParams.getAll('status').flatMap((item) => {
    const parsed = normalizeDraftStatus(item)
    return parsed ? [parsed] : []
  })
  const threadId = url.searchParams.get('threadId')
  const runId = url.searchParams.get('runId')
  const sourceEntityType = url.searchParams.get('sourceEntityType')
  const sourceEntityId = url.searchParams.get('sourceEntityId')
  const pageKey = url.searchParams.get('pageKey')
  const pageType = url.searchParams.get('pageType')
  const pageRoute = url.searchParams.get('pageRoute')
  const pageEntityType = url.searchParams.get('pageEntityType')
  const pageEntityId = url.searchParams.get('pageEntityId')
  const limit = url.searchParams.get('limit')
  const parsedLimit = parseLimitParam(limit, 100)
  return {
    ...(parsedProjectId !== undefined ? { projectId: parsedProjectId } : {}),
    ...(url.searchParams.has('kind') ? { kind } : {}),
    ...(statuses.length > 1 ? { statuses: Array.from(new Set(statuses)) } : status ? { status } : {}),
    ...(threadId ? { threadId } : {}),
    ...(runId ? { runId } : {}),
    ...(sourceEntityType ? { sourceEntityType } : {}),
    ...(sourceEntityId ? { sourceEntityId } : {}),
    ...(pageKey ? { pageKey } : {}),
    ...(pageType ? { pageType } : {}),
    ...(pageRoute ? { pageRoute } : {}),
    ...(pageEntityType ? { pageEntityType } : {}),
    ...(pageEntityId ? { pageEntityId } : {}),
    ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
  }
}

export function parseOptionalProjectIdParam(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  if (isValidAgentProjectId(parsed)) return parsed
  throw new AgentHTTPError(400, 'projectId must be a positive safe integer')
}

function normalizeDraftBodyProjectId(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (isValidAgentProjectId(value)) return value
  throw new AgentHTTPError(400, 'draft projectId must be a positive safe integer')
}

export function normalizeAgentPackBody(body: Record<string, unknown>, packInstallRootDir: string): Parameters<typeof installAgentPack>[0] {
  const pluginId = typeof body.pluginId === 'string' && body.pluginId.trim() ? body.pluginId.trim() : undefined
  if (!pluginId) throw new AgentHTTPError(400, 'agent pack pluginId is required')
  if (!Array.isArray(body.files) || body.files.length === 0) throw new AgentHTTPError(400, 'agent pack files are required')
  const files: AgentPackFile[] = body.files.map((file, index) => {
    if (!isRecord(file)) throw new AgentHTTPError(400, `agent pack file ${index + 1} must be an object`)
    if (typeof file.path !== 'string' || !file.path.trim()) throw new AgentHTTPError(400, `agent pack file ${index + 1} path is required`)
    if (typeof file.content !== 'string') throw new AgentHTTPError(400, `agent pack file ${index + 1} content must be a string`)
    return { path: file.path, content: file.content }
  })
  return { packInstallRootDir, pluginId, files }
}

export function normalizeAgentPackUninstallBody(body: Record<string, unknown>, packInstallRootDir: string): Parameters<typeof uninstallAgentPack>[0] {
  const pluginId = typeof body.pluginId === 'string' && body.pluginId.trim() ? body.pluginId.trim() : undefined
  if (!pluginId) throw new AgentHTTPError(400, 'agent pack pluginId is required')
  return { packInstallRootDir, pluginId }
}

export function normalizeMemoryQuery(url: URL): Parameters<AgentRuntimeRouter['listMemories']>[0] | undefined {
  const scope = url.searchParams.get('scope')
  if (scope === 'global' || scope === 'thread') return undefined
  const projectId = normalizeMemoryProjectId(url)
  if (!isValidMemoryProjectId(projectId)) return undefined
  const kind = url.searchParams.get('kind')
  const query = url.searchParams.get('query')
  const limit = url.searchParams.get('limit')
  const parsedLimit = parseLimitParam(limit, 100)
  return {
    projectId,
    ...(kind === 'preference' || kind === 'fact' || kind === 'item_ref' || kind === 'entity_ref' || kind === 'draft' || kind === 'decision' || kind === 'warning' ? { kind } : {}),
    ...(query ? { query } : {}),
    ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
  }
}

export function normalizeMemoryBody(body: Record<string, unknown>): Parameters<AgentRuntimeRouter['createMemory']>[0] {
  const projectId = isValidMemoryProjectId(body.projectId) ? body.projectId : undefined
  const kind = body.kind === 'preference' || body.kind === 'fact' || body.kind === 'item_ref' || body.kind === 'entity_ref' || body.kind === 'draft' || body.kind === 'decision' || body.kind === 'warning'
    ? body.kind
    : undefined
  if (projectId === undefined) throw new AgentHTTPError(400, 'memory projectId is required')
  if (typeof body.title !== 'string' || body.title.trim().length === 0) throw new AgentHTTPError(400, 'memory title is required')
  if (!kind) throw new AgentHTTPError(400, 'memory kind is required')
  if (typeof body.content !== 'string' || body.content.trim().length === 0) throw new AgentHTTPError(400, 'memory content is required')
  return {
    projectId,
    title: body.title,
    kind,
    content: body.content,
    ...(typeof body.sourceThreadId === 'string' ? { sourceThreadId: body.sourceThreadId } : typeof body.threadId === 'string' ? { sourceThreadId: body.threadId } : {}),
    ...(typeof body.sourceRunId === 'string' ? { sourceRunId: body.sourceRunId } : {}),
    ...(typeof body.sourceMessageId === 'string' ? { sourceMessageId: body.sourceMessageId } : {}),
  }
}

export function normalizeMemoryProjectId(url: URL): number | undefined {
  const projectId = url.searchParams.get('projectId')
  if (projectId === null || projectId.trim() === '') return undefined
  const parsed = Number(projectId)
  if (isValidMemoryProjectId(parsed)) return parsed
  return undefined
}

function normalizeDraftSource(source: Record<string, unknown>): Record<string, JSONValue> {
  return {
    ...(typeof source.entityType === 'string' ? { entityType: source.entityType } : {}),
    ...(isValidAgentReferenceId(source.entityId) ? { entityId: source.entityId } : {}),
    ...(typeof source.pipelineNodeId === 'number' || typeof source.pipelineNodeId === 'string' ? { pipelineNodeId: source.pipelineNodeId } : {}),
    ...(typeof source.runId === 'string' ? { runId: source.runId } : {}),
    ...(typeof source.threadId === 'string' ? { threadId: source.threadId } : {}),
    ...(typeof source.userId === 'number' || typeof source.userId === 'string' ? { userId: source.userId } : {}),
    ...(typeof source.pageKey === 'string' ? { pageKey: source.pageKey } : {}),
    ...(typeof source.pageType === 'string' ? { pageType: source.pageType } : {}),
    ...(typeof source.pageRoute === 'string' ? { pageRoute: source.pageRoute } : {}),
    ...(typeof source.pageEntityType === 'string' ? { pageEntityType: source.pageEntityType } : {}),
    ...(isValidAgentReferenceId(source.pageEntityId) ? { pageEntityId: source.pageEntityId } : {}),
  }
}

const AGENT_TRACE_EVENT_KIND_SET = new Set<AgentTraceEventKind>(AGENT_TRACE_EVENT_KINDS)
const AGENT_DEBUG_EVIDENCE_KIND_SET = new Set(['model_request', 'model_response', 'tool_args', 'tool_result', 'raw_event'])

export function normalizeTraceQuery(url: URL): { ok: true; query: AgentTraceQuery } | { ok: false; error: string } {
  const cursor = url.searchParams.get('cursor')
  const limitRaw = url.searchParams.get('limit')
  const kind = url.searchParams.get('kind')
  const limit = parseLimitParam(limitRaw, Number.MAX_SAFE_INTEGER - 1)
  if (kind && !AGENT_TRACE_EVENT_KIND_SET.has(kind as AgentTraceEventKind)) return { ok: false, error: `invalid trace kind: ${kind}` }
  return { ok: true, query: {
    ...(cursor ? { cursor } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(kind ? { kind: kind as AgentTraceEventKind } : {}),
  } }
}

export function normalizeDebugEvidenceRefQuery(url: URL): { ok: true; query: RuntimeDebugEvidenceRefQuery } | { ok: false; error: string } {
  const kind = url.searchParams.get('kind')
  if (kind && !AGENT_DEBUG_EVIDENCE_KIND_SET.has(kind)) return { ok: false, error: `invalid debug evidence kind: ${kind}` }
  return { ok: true, query: {
    ...(kind ? { kind: kind as RuntimeDebugEvidenceRefQuery['kind'] } : {}),
    ...(url.searchParams.get('contextBundleId') ? { contextBundleId: url.searchParams.get('contextBundleId') ?? undefined } : {}),
    ...(url.searchParams.get('refKey') ? { refKey: url.searchParams.get('refKey') ?? undefined } : {}),
    ...(url.searchParams.get('contentHash') ? { contentHash: url.searchParams.get('contentHash') ?? undefined } : {}),
    ...(url.searchParams.get('resultHash') ? { resultHash: url.searchParams.get('resultHash') ?? undefined } : {}),
  } }
}

export function normalizeThreadListQuery(url: URL): { cursor?: string; limit: number; includeProvisional?: boolean } {
  return {
    ...(url.searchParams.get('cursor') ? { cursor: url.searchParams.get('cursor') ?? undefined } : {}),
    limit: parseLimitParam(url.searchParams.get('limit'), 100) ?? 100,
    ...(url.searchParams.get('includeProvisional') === 'true' ? { includeProvisional: true } : {}),
  }
}

export function activeAgentConfigFileId(manifest: { metadata?: Record<string, unknown> }): string | null {
  const configFileId = typeof manifest.metadata?.configFileId === 'string' ? manifest.metadata.configFileId.trim() : ''
  return configFileId || null
}

export function paginatedThreadSummaries(
  summaries: AgentThreadSummary[],
  query: { cursor?: string; limit: number; includeProvisional?: boolean },
): AgentThreadListPage {
  const visibleSummaries = query.includeProvisional
    ? summaries
    : summaries.filter((thread) => thread.lifecycle !== 'provisional' && thread.lifecycle !== 'abandoned')
  const total = visibleSummaries.length
  const cursorIndex = query.cursor ? visibleSummaries.findIndex((thread) => thread.id === query.cursor) : -1
  const startIndex = query.cursor ? cursorIndex + 1 : 0
  const pageStartIndex = query.cursor && cursorIndex < 0 ? total : startIndex
  const threads = visibleSummaries.slice(pageStartIndex, pageStartIndex + query.limit)
  const nextIndex = pageStartIndex + threads.length
  const hasMore = nextIndex < total
  return {
    threads,
    total,
    limit: query.limit,
    hasMore,
    ...(hasMore && threads.length > 0 ? { nextCursor: threads[threads.length - 1]?.id } : {}),
  }
}

function parseLimitParam(value: string | null, max: number): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(max, Math.max(1, Math.floor(parsed)))
}

export function asPlannerUserRun(body: Record<string, unknown>): Record<string, unknown> & { role: 'planner'; parentRunId?: undefined; taskId?: undefined } {
  const { parentRunId: _parentRunId, taskId: _taskId, ...rest } = body
  return { ...rest, role: 'planner' }
}

export function asDirectToolRun(body: Record<string, unknown>): Record<string, unknown> & {
  role: 'worker'
  parentRunId?: undefined
  taskGraphId?: undefined
  taskId?: undefined
} {
  const {
    role: _role,
    parentRunId: _parentRunId,
    taskGraphId: _taskGraphId,
    taskId: _taskId,
    progress: _progress,
    blockedReason: _blockedReason,
    ...rest
  } = body
  return { ...rest, role: 'worker' }
}
