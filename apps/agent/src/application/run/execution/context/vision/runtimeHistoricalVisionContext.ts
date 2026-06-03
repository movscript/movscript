import { normalizeClientInput, type NormalizedClientInput } from '../../../../../context/input/client/normalizeClientInput.js'
import type { CoreImageProcessingPort } from '../../../../../ports/media/imageProcessingPort.js'
import type { AgentClientAttachmentRef, AgentMessage, AgentRun, AgentThread, JSONValue } from '../../../../../state/shared/types.js'
import type { RuntimeHistoricalVisionContext, RuntimeHistoricalVisionReference } from '../../../../../context/prompt/turn/runtimeHistoricalVisionTypes.js'

const DEFAULT_MAX_HISTORICAL_IMAGES = 3

export interface RuntimeHistoricalVisionContextInput {
  run: AgentRun
  thread: AgentThread
  sourceMessageId?: string
  currentClientInput?: NormalizedClientInput
  imageProcessingPort?: CoreImageProcessingPort
  maxImages?: number
  signal?: AbortSignal
}

interface HistoricalVisionCandidate {
  message: AgentMessage
  attachment: AgentClientAttachmentRef
}

export async function resolveRuntimeHistoricalVisionContext(input: RuntimeHistoricalVisionContextInput): Promise<RuntimeHistoricalVisionContext | undefined> {
  const candidates = historicalImageCandidates(input.thread, input.sourceMessageId)
  if (candidates.length === 0) return undefined

  const maxImages = input.maxImages ?? DEFAULT_MAX_HISTORICAL_IMAGES
  const selected = candidates.slice(0, maxImages)
  const currentImageCount = currentImageAttachmentCount(input.currentClientInput)
  const decisions: Array<Record<string, JSONValue>> = []
  const references: RuntimeHistoricalVisionReference[] = []

  for (const candidate of selected) {
    const base = referenceFromCandidate(candidate)
    if (currentImageCount > 0) {
      decisions.push(decisionFor(candidate, 'metadata_only', 'Current user input already contains image attachments, so historical images are retained as metadata only.'))
      references.push(base)
      continue
    }
    if (!candidate.attachment.dataUrl && candidate.attachment.resourceId === undefined) {
      decisions.push(decisionFor(candidate, 'metadata_only', 'Historical image attachment has no resource_id or data_url available.'))
      references.push(base)
      continue
    }
    if (!input.imageProcessingPort) {
      decisions.push(decisionFor(candidate, 'metadata_only', 'Historical image preprocessing is unavailable, so the original payload is withheld from model context.'))
      references.push(base)
      continue
    }
    try {
      const processed = await input.imageProcessingPort.process({
        run: input.run,
        resourceId: candidate.attachment.resourceId,
        dataUrl: candidate.attachment.dataUrl,
        name: candidate.attachment.name,
        mimeType: candidate.attachment.mimeType,
        preset: 'vision_default',
        signal: input.signal,
      })
      decisions.push({
        ...decisionFor(candidate, 'retain', 'Historical image was rebuilt as an optimized model vision payload.'),
        originalBytes: processed.source.sizeBytes,
        optimizedBytes: processed.output.sizeBytes,
        outputMimeType: processed.output.mimeType,
        outputWidth: processed.output.width,
        outputHeight: processed.output.height,
      })
      references.push({
        ...base,
        mimeType: processed.output.mimeType,
        size: processed.output.sizeBytes,
        dataUrl: processed.output.dataUrl,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      decisions.push(decisionFor(candidate, 'metadata_only', `Historical image preprocessing failed and the original payload was withheld from model context: ${reason}`))
      references.push(base)
    }
  }

  const includedInlineImageCount = references.filter((reference) => !!reference.dataUrl).length
  const metadataOnlyCount = references.length - includedInlineImageCount
  const droppedCount = Math.max(0, candidates.length - selected.length)
  if (droppedCount > 0) {
    decisions.push({
      action: 'drop',
      stage: 'historical_visual_context',
      reason: 'Historical image candidate limit reached.',
      droppedCount,
      maxImages,
    })
  }

  return {
    references,
    projection: {
      candidateCount: candidates.length,
      selectedCount: selected.length,
      includedInlineImageCount,
      metadataOnlyCount,
      droppedCount,
      currentImageCount,
      maxImages,
      decisions: decisions as unknown as JSONValue,
    },
  }
}

function historicalImageCandidates(thread: AgentThread, sourceMessageId: string | undefined): HistoricalVisionCandidate[] {
  const sourceIndex = sourceMessageId
    ? thread.messages.findIndex((message) => message.id === sourceMessageId)
    : thread.messages.length
  const history = sourceIndex >= 0 ? thread.messages.slice(0, sourceIndex) : thread.messages
  const candidates: HistoricalVisionCandidate[] = []
  for (const message of [...history].reverse()) {
    if (message.role !== 'user') continue
    const clientInput = normalizeClientInput(message.clientInput)
    if (!clientInput) continue
    for (const attachment of clientInput.attachments) {
      if (!isImageAttachment(attachment)) continue
      candidates.push({ message, attachment })
    }
  }
  return dedupeCandidates(candidates)
}

function dedupeCandidates(candidates: HistoricalVisionCandidate[]): HistoricalVisionCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = candidate.attachment.resourceId !== undefined
      ? `resource:${candidate.attachment.resourceId}`
      : candidate.attachment.id
        ? `attachment:${candidate.attachment.id}`
        : `${candidate.message.id}:${candidate.attachment.name ?? 'image'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function currentImageAttachmentCount(clientInput: NormalizedClientInput | undefined): number {
  return clientInput?.attachments.filter(isImageAttachment).length ?? 0
}

function isImageAttachment(attachment: AgentClientAttachmentRef): boolean {
  return attachment.type === 'image' || attachment.mimeType?.toLowerCase().startsWith('image/') === true
}

function referenceFromCandidate(candidate: HistoricalVisionCandidate): RuntimeHistoricalVisionReference {
  return {
    messageId: candidate.message.id,
    messageCreatedAt: candidate.message.createdAt,
    ...(candidate.attachment.id ? { attachmentId: candidate.attachment.id } : {}),
    ...(candidate.attachment.resourceId !== undefined ? { resourceId: candidate.attachment.resourceId } : {}),
    ...(candidate.attachment.name ? { name: candidate.attachment.name } : {}),
    ...(candidate.attachment.mimeType ? { mimeType: candidate.attachment.mimeType } : {}),
    ...(candidate.attachment.size !== undefined ? { size: candidate.attachment.size } : {}),
  }
}

function decisionFor(candidate: HistoricalVisionCandidate, action: 'retain' | 'metadata_only' | 'drop', reason: string): Record<string, JSONValue> {
  return {
    action,
    stage: 'historical_visual_context',
    reason,
    messageId: candidate.message.id,
    ...(candidate.attachment.id ? { attachmentId: candidate.attachment.id } : {}),
    ...(candidate.attachment.resourceId !== undefined ? { resourceId: candidate.attachment.resourceId } : {}),
    ...(candidate.attachment.name ? { name: candidate.attachment.name } : {}),
  }
}
