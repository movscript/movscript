import { api } from '@/shared/infrastructure/api'
import { attachmentFromResource } from '@/features/agent/domain/agentAttachments'
import { extractAgentTaskArtifacts } from '@/features/agent/domain/agentArtifacts'
import { generationParamAuditsFromRun, generationValidationErrorsFromRun } from '@/features/agent/domain/agentGenerationArtifacts'
import { replayGenerationTrace, type GenerationTraceEventLike, type GenerationTraceReplay } from '@/features/agent/domain/agentGenerationMedia'
import { isRecord } from '@/shared/domain/jsonValue'
import { buildRunActivitySnapshot } from '@/features/agent/domain/agentRunActivitySnapshot'
import { runtimeStatusMessageFromRunActivity } from '@/features/agent/domain/agentRuntimeStatusMessage'
import { localAgentClient, type AgentRun, type AgentRunGenerationView, type AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'
import type { AgentAttachment, ChatContextDiagnostic, ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { RawResource } from '@/types'

export interface AgentMessageViewModelPayload {
  attachments?: AgentAttachment[]
  meta: ChatMessageMeta
}

export interface AgentMessageViewModelDeps {
  fetchRunGenerationView?: (runId: string) => Promise<GenerationTraceReplay>
  fetchRunTraceEvents?: (runId: string) => Promise<AgentTraceEvent[]>
  fetchResourceById?: (id: number) => Promise<RawResource | undefined>
}

export function hideGeneratedResultTechnicalSummary(text: string): string {
  const hiddenLine = /^(?:Command:\s*\/(?:image|video)\b.*|Run:\s*\S+|Thread:\s*\S+|Job\s+#\d+|Status:\s*\S+|Output resources?:\s*#?\d+(?:\s*,\s*#?\d+)*)\s*$/i
  return text
    .split('\n')
    .filter((line) => !hiddenLine.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function assistantResultPayloadForRun(
  run: AgentRun,
  liveEvents: ChatRunActivityEvent[] = [],
  assistantContent = '',
  deps: AgentMessageViewModelDeps = {},
): Promise<AgentMessageViewModelPayload> {
  const traceEvents = await traceEventsForRun(run, deps)
  const runWithTrace = traceEvents.length > 0 ? { ...run, traceEvents } : run
  const replay = await generationReplayFromRun(runWithTrace, liveEvents, deps)
  const fallbackIds = outputResourceIdsFromText(assistantContent)
  const attachments = run.streamPartial ? [] : await generatedAttachmentsFromReplay(replay, fallbackIds, assistantContent, deps)
  const generationJobs = replay.jobs
  const generationParamAudits = generationParamAuditsFromRun(run)
  const generationValidationErrors = generationValidationErrorsFromRun(run)
  const contextDiagnostic = contextDiagnosticFromRun(run)
  const draftArtifacts = extractAgentTaskArtifacts(run)
  const activitySnapshot = buildRunActivitySnapshot({ run: runWithTrace, events: liveEvents })
  const runtimeStatus = runtimeStatusMessageFromRunActivity({ activity: activitySnapshot?.activity, generationJobs })
  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    meta: {
      runtimeMessage: {
        threadId: run.threadId,
        runId: run.id,
        ...(run.assistantMessageId ? { messageId: run.assistantMessageId } : {}),
      },
      ...(runtimeStatus ? { runtimeStatus } : {}),
      ...(activitySnapshot ? { localRunActivity: activitySnapshot.activity } : {}),
      ...(contextDiagnostic ? { contextDiagnostic } : {}),
      ...(generationJobs.length > 0 ? { generationJobs } : {}),
      ...(generationParamAudits.length > 0 ? { generationParamAudits } : {}),
      ...(generationValidationErrors.length > 0 ? { generationValidationErrors } : {}),
      ...(draftArtifacts.length > 0 ? { draftArtifacts } : {}),
    },
  }
}

async function traceEventsForRun(run: AgentRun, deps: AgentMessageViewModelDeps): Promise<AgentTraceEvent[]> {
  if ((run.traceEvents ?? []).length > 0) return run.traceEvents ?? []
  try {
    return deps.fetchRunTraceEvents
      ? await deps.fetchRunTraceEvents(run.id)
      : await fetchAllRunTraceEvents(run.id)
  } catch {
    return []
  }
}

export async function hydrateHistoricalGeneratedAttachments(
  content: string,
  existingAttachments: AgentAttachment[] = [],
  deps: AgentMessageViewModelDeps = {},
): Promise<AgentAttachment[]> {
  const existingResourceIds = new Set(existingAttachments.map((attachment) => attachment.resourceId).filter((id): id is number => id !== undefined))
  const missingIds = outputResourceIdsFromText(content).filter((id) => !existingResourceIds.has(id))
  if (missingIds.length === 0) return []
  const resources = await Promise.all(missingIds.map((id) => fetchResourceById(id, deps)))
  const foundAttachments = resources
    .filter((resource): resource is RawResource => !!resource && (resource.type === 'image' || resource.type === 'video'))
    .map((resource) => ({
      ...attachmentFromResource(resource),
      id: `generated-${resource.ID}`,
    }))
  const foundIds = new Set(foundAttachments.map((attachment) => attachment.resourceId).filter((id): id is number => id !== undefined))
  return [
    ...foundAttachments,
    ...missingIds
      .filter((id) => !foundIds.has(id))
      .map((id) => generatedFallbackAttachmentFromText(id, content)),
  ]
}

export async function fetchRunGenerationViewForGeneratedAttachments(runId: string): Promise<GenerationTraceReplay> {
  return generationReplayFromView(await localAgentClient.getRunGenerationView(runId))
}

export async function fetchAllRunTraceEvents(runId: string): Promise<AgentTraceEvent[]> {
  const events: AgentTraceEvent[] = []
  let cursor: string | undefined
  while (true) {
    const response = await localAgentClient.getRunTraceEvents(runId, { cursor, limit: 200 })
    events.push(...response.events)
    if (response.hasMore === false || (response.hasMore === undefined && response.events.length < 200)) return events
    cursor = response.nextCursor ?? response.events.at(-1)?.id
    if (!cursor) return events
  }
}

export async function fetchResourceById(id: number, deps: AgentMessageViewModelDeps = {}): Promise<RawResource | undefined> {
  if (deps.fetchResourceById) return deps.fetchResourceById(id)
  try {
    const { data } = await api.get<RawResource[] | { items: RawResource[] }>('/resources', {
      params: { page: 1, page_size: 200, type: 'image,video' },
    })
    const resources = Array.isArray(data) ? data : data.items
    return resources.find((resource) => resource.ID === id)
  } catch {
    return undefined
  }
}

export function outputResourceIdsFromText(text: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  const patterns = [
    /Output resources?:\s*#?(\d+(?:\s*,\s*#?\d+)*)/gi,
    /输出资源(?:\s*ID)?[:：]?\s*#?(\d+(?:\s*,\s*#?\d+)*)/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      for (const raw of match[1].split(',')) {
        const id = Number(raw.replace(/[^\d]/g, ''))
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
      }
    }
  }
  return ids
}

export function generatedFallbackAttachmentFromText(resourceId: number, text: string): AgentAttachment {
  const isVideo = /(?:Command:\s*\/video|\/video\b|视频)/i.test(text)
  const type: AgentAttachment['type'] = isVideo ? 'video' : 'image'
  return {
    id: `generated-${resourceId}`,
    name: isVideo ? `generated-video-${resourceId}.mp4` : `generated-image-${resourceId}.png`,
    type,
    mimeType: isVideo ? 'video/mp4' : 'image/png',
    size: 0,
    url: `/api/v1/resources/${resourceId}/file`,
    resourceId,
  }
}

async function generationReplayFromRun(
  run: AgentRun,
  liveEvents: GenerationTraceEventLike[] = [],
  deps: AgentMessageViewModelDeps = {},
): Promise<GenerationTraceReplay> {
  if (deps.fetchRunGenerationView) return deps.fetchRunGenerationView(run.id)
  const traceEvents = [
    ...(run.steps ?? []).map((step) => ({ data: step.result, createdAt: step.createdAt, completedAt: step.completedAt })),
    ...(run.traceEvents ?? []),
    ...liveEvents,
  ]
  const replay = replayGenerationTrace(traceEvents)
  if (shouldFetchAuthoritativeGenerationView(run, replay)) {
    try {
      const view = await fetchRunGenerationViewForGeneratedAttachments(run.id)
      if (view.jobs.length > 0 || replay.jobs.length === 0) return view
    } catch {
      // Fall back to local run data when the view endpoint is unavailable.
    }
  }
  if (replay.jobs.length > 0) return replay
  return replay
}

function shouldFetchAuthoritativeGenerationView(run: AgentRun, replay: GenerationTraceReplay): boolean {
  if (isTerminalRun(run)) return true
  if (replay.jobs.length === 0) return true
  return replay.jobs.some((job) => job.status === 'unknown')
}

function isTerminalRun(run: AgentRun): boolean {
  return run.status === 'completed'
    || run.status === 'failed'
    || run.status === 'cancelled'
    || !!run.completedAt
    || !!run.failedAt
    || !!run.cancelledAt
}

function generationReplayFromView(view: AgentRunGenerationView): GenerationTraceReplay {
  return {
    jobs: view.jobs,
    latestJob: view.latestJob,
    outputResourceIds: view.outputResourceIds,
    outputResources: view.outputResources as RawResource[],
    metadataByResourceId: new Map(
      Object.entries(view.metadataByResourceId).map(([id, metadata]) => [Number(id), metadata]),
    ),
    active: view.active,
    terminal: view.terminal,
    succeeded: view.succeeded,
    failed: view.failed,
    cancelled: view.cancelled,
    timeout: view.timeout,
  }
}

async function generatedAttachmentsFromReplay(
  replay: GenerationTraceReplay,
  fallbackResourceIds: number[] = [],
  fallbackContent = '',
  deps: AgentMessageViewModelDeps = {},
): Promise<AgentAttachment[]> {
  const resources = new Map<number, RawResource>(replay.outputResources.map((resource) => [resource.ID, resource]))
  for (const id of [...replay.outputResourceIds, ...fallbackResourceIds]) {
    if (!resources.has(id)) {
      const found = await fetchResourceById(id, deps)
      if (found && (found.type === 'image' || found.type === 'video')) resources.set(id, found)
    }
  }
  return Array.from(resources.values())
    .filter((resource) => resource.type === 'image' || resource.type === 'video')
    .map((resource) => ({
      ...attachmentFromResource(resource),
      id: `generated-${resource.ID}`,
      ...(replay.metadataByResourceId.has(resource.ID) ? { generated: replay.metadataByResourceId.get(resource.ID) } : {}),
    }))
    .concat(
      fallbackResourceIds
        .filter((id) => !resources.has(id))
        .map((id) => generatedFallbackAttachmentFromText(id, fallbackContent)),
    )
}

function contextDiagnosticFromRun(run: AgentRun): ChatContextDiagnostic | undefined {
  const command = isRecord(run.metadata?.command) ? run.metadata.command : undefined
  if (command?.name !== 'context') return undefined
  for (const step of run.steps ?? []) {
    if (step.type !== 'message' || !isRecord(step.result)) continue
    const diagnostic = step.result.diagnostic
    if (isChatContextDiagnostic(diagnostic)) return diagnostic
  }
  return undefined
}

function isChatContextDiagnostic(value: unknown): value is ChatContextDiagnostic {
  if (!isRecord(value)) return false
  if (value.schema !== 'movscript.local_context_diagnostic.v1') return false
  if (!Array.isArray(value.messages) || !Array.isArray(value.debugParts)) return false
  if (!isRecord(value.tools) || !Array.isArray(value.tools.available) || !Array.isArray(value.tools.blocked) || !Array.isArray(value.tools.modelTools)) return false
  return true
}
