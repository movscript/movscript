import type { JSONValue } from '../../../shared/protocol/types.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import type { RuntimeHistoricalVisionContext } from './runtimeHistoricalVisionTypes.js'
import type { RuntimeModelChatMessage, RuntimeModelContentPart } from '../../../model/config/modelConfig.js'
import { runtimeModelTextContent } from '../../../messages/model/modelMessage.js'

const INLINE_IMAGE_PROMPT_ESTIMATE_CHARS = 2048

export interface ReactiveModelTurnProjectionInput {
  baseMessages: RuntimeModelChatMessage[]
  toolLoopHistory: RuntimeModelChatMessage[]
  clientInput?: NormalizedClientInput
  historicalVisionContext?: RuntimeHistoricalVisionContext
  limitChars: number
}

export interface ReactiveModelTurnProjection {
  messages: RuntimeModelChatMessage[]
  toolLoopProjection?: Record<string, JSONValue>
  historicalVisualProjection?: Record<string, JSONValue>
  attachmentProjection?: Record<string, JSONValue>
}

export function buildReactiveModelTurnProjection(input: ReactiveModelTurnProjectionInput): ReactiveModelTurnProjection {
  const lastMessage = input.baseMessages.at(-1)
  const beforeUser = input.baseMessages.slice(0, -1)
  const historicalVisualMessages = extractHistoricalVisualMessages(input.historicalVisionContext)
  let toolLoopMessages = input.toolLoopHistory
  let visualMessages = historicalVisualMessages
  const assembleMessages = () => [
    ...beforeUser,
    ...toolLoopMessages,
    ...visualMessages,
    ...(lastMessage ? [lastMessage] : []),
  ]
  let messages = assembleMessages()
  const decisions: Array<Record<string, JSONValue>> = []
  const initialChars = estimateRuntimeModelMessagesWithImages(messages)
  const toolLoopChars = estimateRuntimeModelMessagesWithImages(input.toolLoopHistory)
  if (initialChars > input.limitChars && input.toolLoopHistory.length > 0) {
    const summary = runtimeModelTextContent([
      'Tool-loop tail compacted for prompt budget.',
      `- ${input.toolLoopHistory.length} current tool-loop message(s) were summarized instead of included verbatim.`,
      `- Original tool-loop estimate: ${toolLoopChars} chars.`,
      '- The durable transcript and tool result refs remain available outside this model-context projection.',
    ].join('\n'))
    toolLoopMessages = [{ role: 'system', content: summary }]
    messages = assembleMessages()
    decisions.push({
      action: 'compact',
      stage: 'tool_loop_tail',
      reason: 'Current tool-loop tail was summarized because the full model request exceeded the context window after routine history compaction.',
      messageCount: input.toolLoopHistory.length,
      originalChars: toolLoopChars,
      requestCharsBefore: initialChars,
      requestCharsAfter: estimateRuntimeModelMessagesWithImages(messages),
      limitChars: input.limitChars,
    })
  }

  let historicalVisualProjection = input.historicalVisionContext?.projection
  const requestCharsBeforeHistoricalVisualTrim = estimateRuntimeModelMessagesWithImages(messages)
  if (requestCharsBeforeHistoricalVisualTrim > input.limitChars && hasInlineImagePartsInMessages(visualMessages)) {
    const originalInlineImageChars = imagePartCharsInMessages(visualMessages)
    visualMessages = visualMessages.map((message) => ({
      ...message,
      content: message.content.filter((part) => part.type !== 'image'),
    }))
    messages = assembleMessages()
    const droppedInlineImageCount = historicalVisualMessagesInlineImageCount(input.historicalVisionContext)
    historicalVisualProjection = {
      ...(historicalVisualProjection ?? {}),
      includedInlineImageCount: 0,
      metadataOnlyCount: (projectionNumber(historicalVisualProjection, 'metadataOnlyCount') ?? 0) + droppedInlineImageCount,
      droppedInlineImageCount,
      decisions: [
        ...((historicalVisualProjection?.decisions as unknown[] | undefined) ?? []),
        {
          action: 'drop',
          stage: 'historical_visual_context',
          reason: 'Historical inline image payloads were removed before current user attachments because the model request exceeded the context window.',
          inlineImageCount: droppedInlineImageCount,
          originalInlineImageChars,
          requestCharsBefore: requestCharsBeforeHistoricalVisualTrim,
          requestCharsAfter: estimateRuntimeModelMessagesWithImages(messages),
          limitChars: input.limitChars,
        },
      ] as unknown as JSONValue,
    }
  }

  let attachmentProjection = input.clientInput && input.clientInput.attachments.length > 0
    ? attachmentProjectionTrace(input.clientInput)
    : undefined
  const requestCharsBeforeAttachmentTrim = estimateRuntimeModelMessagesWithImages(messages)
  if (requestCharsBeforeAttachmentTrim > input.limitChars && hasInlineImageParts(messages.at(-1))) {
    const originalInlineImageChars = imagePartChars(messages.at(-1))
    messages = replaceLastMessage(messages, (message) => ({
      ...message,
      content: message.content.filter((part) => part.type !== 'image'),
    }))
    const requestCharsAfter = estimateRuntimeModelMessagesWithImages(messages)
    const attachmentDecisions = [
      ...((attachmentProjection?.decisions as unknown[] | undefined) ?? []),
      {
        action: 'drop',
        stage: 'user_attachments',
        reason: 'Inline image payloads were removed after history/tool-loop compaction was not enough to fit the model request. Text attachment metadata remains in the user message.',
        inlineImageCount: input.clientInput?.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length ?? 0,
        originalInlineImageChars,
        requestCharsBefore: requestCharsBeforeAttachmentTrim,
        requestCharsAfter,
        limitChars: input.limitChars,
      },
    ]
    attachmentProjection = {
      ...(attachmentProjection ?? {}),
      inlineImageCount: 0,
      metadataOnlyCount: input.clientInput?.attachments.length ?? 0,
      droppedInlineImageCount: input.clientInput?.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length ?? 0,
      decisions: attachmentDecisions as unknown as JSONValue,
    }
  }

  return {
    messages,
    ...(input.toolLoopHistory.length > 0 ? { toolLoopProjection: toolLoopProjectionTrace(input.toolLoopHistory, decisions) } : {}),
    ...(historicalVisualProjection ? { historicalVisualProjection } : {}),
    ...(attachmentProjection ? { attachmentProjection } : {}),
  }
}

function extractHistoricalVisualMessages(context: RuntimeHistoricalVisionContext | undefined): RuntimeModelChatMessage[] {
  if (!context || context.references.length === 0) return []
  const lines = [
    '[Historical visual references from earlier user messages]',
    'These image references came from prior user messages in this thread and are included to preserve visual continuity for the current turn.',
    ...context.references.map((reference, index) => {
      const identity = reference.resourceId !== undefined ? `resource_id=${reference.resourceId}` : reference.attachmentId ? `attachment_id=${reference.attachmentId}` : 'local_preview'
      const payload = reference.dataUrl ? ', image_payload=data_url' : ', image_payload=metadata_only'
      return `${index + 1}. ${reference.name ?? 'historical image'} (${reference.mimeType ?? 'image/unknown'}, ${reference.size ?? 0} bytes, message_id=${reference.messageId}, ${identity}${payload})`
    }),
  ]
  const parts: RuntimeModelContentPart[] = runtimeModelTextContent(lines.join('\n'))
  for (const reference of context.references) {
    if (!reference.dataUrl) continue
    parts.push({
      type: 'image',
      source: { type: 'data_url', dataUrl: reference.dataUrl },
      detail: 'auto',
    })
  }
  return [{ role: 'user', content: parts }]
}

function toolLoopProjectionTrace(messages: RuntimeModelChatMessage[], decisions: Array<Record<string, JSONValue>> = []): Record<string, JSONValue> {
  const chars = estimateRuntimeModelMessagesWithImages(messages)
  return {
    messageCount: messages.length,
    includedCount: decisions.some((decision) => decision.action === 'compact') ? 0 : messages.length,
    compactedCount: decisions.some((decision) => decision.action === 'compact') ? messages.length : 0,
    chars,
    decisions: (decisions.length > 0 ? decisions : [{
      action: 'retain',
      stage: 'tool_loop_tail',
      reason: 'Current tool-loop messages are retained verbatim for model continuity.',
      messageCount: messages.length,
      chars,
    }]) as unknown as JSONValue,
  }
}

function attachmentProjectionTrace(input: NormalizedClientInput): Record<string, JSONValue> {
  const inlineImageCount = input.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length
  const metadataOnlyCount = input.attachments.length - inlineImageCount
  const totalBytes = input.attachments.reduce((total, attachment) => total + (attachment.size ?? 0), 0)
  const dataUrlChars = input.attachments.reduce((total, attachment) => total + (attachment.dataUrl?.length ?? 0), 0)
  return {
    attachmentCount: input.attachments.length,
    inlineImageCount,
    metadataOnlyCount,
    totalBytes,
    dataUrlChars,
    decisions: [{
      action: 'retain',
      stage: 'user_attachments',
      reason: 'Image data_url attachments are sent as image parts; video/file attachments remain metadata-only unless a tool loads derived content.',
      attachmentCount: input.attachments.length,
      inlineImageCount,
      metadataOnlyCount,
      dataUrlChars,
    }],
  }
}

function estimateRuntimeModelMessagesWithImages(messages: RuntimeModelChatMessage[]): number {
  return messages.reduce((total, message) => total + message.role.length + message.content.reduce((partTotal, part) => {
    if (part.type === 'text') return partTotal + part.text.length
    return partTotal + INLINE_IMAGE_PROMPT_ESTIMATE_CHARS
  }, 0) + 2, 0)
}

function hasInlineImageParts(message: RuntimeModelChatMessage | undefined): boolean {
  return message?.content.some((part) => part.type === 'image' && part.source.type === 'data_url') === true
}

function hasInlineImagePartsInMessages(messages: RuntimeModelChatMessage[]): boolean {
  return messages.some(hasInlineImageParts)
}

function imagePartChars(message: RuntimeModelChatMessage | undefined): number {
  return message?.content.reduce((total, part) => part.type === 'image' && part.source.type === 'data_url' ? total + part.source.dataUrl.length : total, 0) ?? 0
}

function imagePartCharsInMessages(messages: RuntimeModelChatMessage[]): number {
  return messages.reduce((total, message) => total + imagePartChars(message), 0)
}

function historicalVisualMessagesInlineImageCount(context: RuntimeHistoricalVisionContext | undefined): number {
  return context?.references.filter((reference) => !!reference.dataUrl).length ?? 0
}

function projectionNumber(projection: Record<string, JSONValue> | undefined, key: string): number | undefined {
  const value = projection?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function replaceLastMessage(messages: RuntimeModelChatMessage[], replace: (message: RuntimeModelChatMessage) => RuntimeModelChatMessage): RuntimeModelChatMessage[] {
  const last = messages.at(-1)
  if (!last) return messages
  return [...messages.slice(0, -1), replace(last)]
}

function isImageAttachment(type?: string, mimeType?: string): boolean {
  return type === 'image' || mimeType?.toLowerCase().startsWith('image/') === true
}
