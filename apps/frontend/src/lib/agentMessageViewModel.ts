import { api } from '@/lib/api'
import { attachmentFromResource } from '@/lib/agentAttachments'
import { extractAgentTaskArtifacts } from '@/lib/agentArtifacts'
import { generationParamAuditsFromRun, generationValidationErrorsFromRun } from '@/lib/agentGenerationArtifacts'
import { replayGenerationTrace, type GenerationTraceEventLike, type GenerationTraceReplay } from '@/lib/agentGenerationMedia'
import { compactRunActivity, mergeRunActivityEvents } from '@/lib/agentRunActivity'
import { localAgentClient, type AgentRun, type AgentTraceEvent } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatContextDiagnostic, ChatMessageMeta, ChatRunActivityEvent } from '@/store/agentStore'
import type { RawResource } from '@/types'

export interface AgentMessageViewModelPayload {
  attachments?: AgentAttachment[]
  meta: ChatMessageMeta
}

export interface AgentMessageViewModelDeps {
  fetchRunTraceEvents?: (runId: string) => Promise<GenerationTraceEventLike[]>
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
  const replay = await generationReplayFromRun(run, liveEvents, deps)
  const fallbackIds = outputResourceIdsFromText(assistantContent)
  const attachments = run.streamPartial ? [] : await generatedAttachmentsFromReplay(replay, fallbackIds, assistantContent, deps)
  const generationJobs = replay.jobs
  const generationParamAudits = generationParamAuditsFromRun(run)
  const generationValidationErrors = generationValidationErrorsFromRun(run)
  const contextDiagnostic = contextDiagnosticFromRun(run)
  const draftArtifacts = extractAgentTaskArtifacts(run)
  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    meta: {
      contextLabels: [`run ${run.status}`],
      localRunActivity: mergeRunActivityEvents(compactRunActivity(run), liveEvents),
      ...(contextDiagnostic ? { contextDiagnostic } : {}),
      ...(generationJobs.length > 0 ? { generationJobs } : {}),
      ...(generationParamAudits.length > 0 ? { generationParamAudits } : {}),
      ...(generationValidationErrors.length > 0 ? { generationValidationErrors } : {}),
      ...(draftArtifacts.length > 0 ? { draftArtifacts } : {}),
    },
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

export async function fetchRunTraceEventsForGeneratedAttachments(runId: string): Promise<GenerationTraceEventLike[]> {
  try {
    const response = await localAgentClient.getRunTraceEvents(runId, { limit: 200, kind: 'tool_call' })
    return response.events
  } catch {
    return []
  }
}

export async function fetchAllRunTraceEvents(runId: string): Promise<AgentTraceEvent[]> {
  const events: AgentTraceEvent[] = []
  let cursor: string | undefined
  while (true) {
    const response = await localAgentClient.getRunTraceEvents(runId, { cursor, limit: 200 })
    events.push(...response.events)
    if (response.events.length < 200) return events
    cursor = response.events.at(-1)?.id
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
  const traceEvents = [
    ...(run.steps ?? []).map((step) => ({ data: step.result, createdAt: step.createdAt, completedAt: step.completedAt })),
    ...(run.traceEvents ?? []),
    ...liveEvents,
    ...await (deps.fetchRunTraceEvents ?? fetchRunTraceEventsForGeneratedAttachments)(run.id),
  ]
  return replayGenerationTrace(traceEvents)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
