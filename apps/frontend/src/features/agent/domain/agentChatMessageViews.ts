import type {
  AgentChatInput,
  AgentChatThreadItem,
} from '@/features/agent/domain/agentChatThreadItems'

export type AgentChatMessageImageView = { url: string; alt: string }
export type AgentChatMessageMediaView = { url: string; kind: 'audio' | 'video'; label: string; mimeType?: string }

export type AgentChatUserMessageView = {
  text: string
  attachments: AgentChatInput[]
  attachmentLabels: string[]
  imageAttachments: AgentChatMessageImageView[]
  mediaAttachments: AgentChatMessageMediaView[]
  textElementSummary: string[]
  textElementDetails: Array<{ inputIndex: number; textElements: unknown[] }>
  rawDetails?: unknown
}

export type AgentChatHookPromptView = {
  text: string
  hookRunIds: string[]
  meta: Array<string | undefined | null | false>
  rawDetails?: unknown
}

export type AgentChatAgentMessageView = {
  text: string
  phaseLabel: string | undefined
  hasMemoryCitation: boolean
  memoryCitationSummary: string[]
  memoryCitationDetails?: unknown
  rawDetails?: unknown
}

export function agentChatUserMessageView(item: Extract<AgentChatThreadItem, { type: 'userMessage' }>): AgentChatUserMessageView {
  const attachments = item.content.filter((part) => part.type !== 'text')
  return {
    text: agentChatUserMessageText(item),
    attachments,
    attachmentLabels: attachments.map(agentChatInputLabel),
    imageAttachments: agentChatImageAttachmentViews(item.content),
    mediaAttachments: agentChatMentionMediaPreviews(item.content),
    textElementDetails: item.content.flatMap((part, index) => (
      part.type === 'text' && part.textElements.length > 0
        ? [{ inputIndex: index, textElements: part.textElements }]
        : []
    )),
    textElementSummary: item.content.flatMap((part, inputIndex) => (
      part.type === 'text'
        ? part.textElements.flatMap((element, elementIndex) => agentChatTextElementLabel(element, inputIndex, elementIndex))
        : []
    )),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatHookPromptView(item: Extract<AgentChatThreadItem, { type: 'hookPrompt' }>): AgentChatHookPromptView {
  const hookRunIds = item.fragments.map((fragment) => fragment.hookRunId).filter(Boolean)
  return {
    text: item.fragments.map((fragment) => fragment.text).filter(Boolean).join('\n\n'),
    hookRunIds,
    meta: [hookRunIds.length ? `${hookRunIds.length} fragment(s)` : undefined],
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

export function agentChatAgentMessageView(item: Extract<AgentChatThreadItem, { type: 'agentMessage' }>): AgentChatAgentMessageView {
  return {
    text: item.text,
    phaseLabel: item.phase ? agentChatMessagePhaseLabel(item.phase) : undefined,
    hasMemoryCitation: item.memoryCitation !== undefined && item.memoryCitation !== null,
    memoryCitationSummary: agentChatMemoryCitationSummary(item.memoryCitation),
    ...(item.memoryCitation ? { memoryCitationDetails: item.memoryCitation } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

function agentChatUserMessageText(item: Extract<AgentChatThreadItem, { type: 'userMessage' }>): string {
  return item.content.map((part) => part.type === 'text' ? part.text : '').join('\n').trim()
}

function agentChatInputLabel(input: AgentChatInput): string {
  if (input.type === 'text') return 'Text'
  if (input.type === 'image' && input.resourceId !== undefined) return compactStrings(['Image resource', input.name, `resource:${input.resourceId}`, input.mimeType, input.url]).join(' ')
  if (input.type === 'image') return `Image ${input.detail ?? ''} ${input.url}`.trim()
  if (input.type === 'localImage') return `Local image ${input.detail ?? ''} ${input.path}`.trim()
  if (input.type === 'skill') return `Skill ${input.name} ${input.path}`.trim()
  if (input.path.startsWith('resource:')) return `${agentChatResourceMentionKind(input)} ${input.name} ${input.path}`.trim()
  if (agentChatMentionMediaKind(input) || agentChatMentionIsImage(input)) return `${agentChatMediaMentionKind(input)} ${input.name} ${input.path}`.trim()
  return `Mention ${input.name} ${input.path}`.trim()
}

function agentChatImageAttachmentViews(inputs: AgentChatInput[]): AgentChatMessageImageView[] {
  return inputs
    .filter((input): input is Extract<AgentChatInput, { type: 'image' | 'localImage' | 'mention' }> => (
      input.type === 'image'
      || input.type === 'localImage'
      || (input.type === 'mention' && agentChatMentionIsImage(input) && Boolean(input.url))
    ))
    .map((input, index) => agentChatImageAttachmentView(input, index))
}

function agentChatImageAttachmentView(input: Extract<AgentChatInput, { type: 'image' | 'localImage' | 'mention' }>, index: number): AgentChatMessageImageView {
  const source = input.type === 'localImage'
    ? 'local'
    : input.type === 'mention' || (input.type === 'image' && input.resourceId !== undefined)
      ? 'resource'
      : 'remote'
  const detail = input.type === 'mention' ? undefined : input.detail
  return {
    url: input.type === 'image' ? input.url : input.url ?? input.path,
    alt: `Image attachment ${index + 1} (${source}${detail ? `, ${detail}` : ''})`,
  }
}

function agentChatResourceMentionKind(input: Extract<AgentChatInput, { type: 'mention' }>): string {
  const kind = input.kind?.trim().toLowerCase()
  const mimeType = input.mimeType?.trim().toLowerCase()
  if (kind === 'video' || mimeType?.startsWith('video/')) return 'Video resource'
  if (kind === 'image' || mimeType?.startsWith('image/')) return 'Image resource'
  if (kind === 'audio' || mimeType?.startsWith('audio/')) return 'Audio resource'
  return 'Resource'
}

function agentChatMediaMentionKind(input: Extract<AgentChatInput, { type: 'mention' }>): string {
  const kind = agentChatMentionMediaKind(input)
  if (kind === 'video') return 'Video attachment'
  if (kind === 'audio') return 'Audio attachment'
  return agentChatMentionIsImage(input) ? 'Image attachment' : 'Attachment'
}

function compactStrings(values: Array<string | undefined | null | false>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function agentChatMentionMediaPreviews(inputs: AgentChatInput[]): AgentChatMessageMediaView[] {
  return inputs.flatMap((input, index) => {
    if (input.type !== 'mention' || !input.url) return []
    const kind = agentChatMentionMediaKind(input)
    if (!kind) return []
    return [{
      url: input.url,
      kind,
      label: `${kind === 'video' ? 'Video' : 'Audio'} attachment ${index + 1}`,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    }]
  })
}

function agentChatMentionMediaKind(input: Extract<AgentChatInput, { type: 'mention' }>): 'audio' | 'video' | null {
  const kind = input.kind?.trim().toLowerCase()
  const mimeType = input.mimeType?.trim().toLowerCase()
  if (kind === 'video' || mimeType?.startsWith('video/')) return 'video'
  if (kind === 'audio' || mimeType?.startsWith('audio/')) return 'audio'
  return null
}

function agentChatMentionIsImage(input: Extract<AgentChatInput, { type: 'mention' }>): boolean {
  const kind = input.kind?.trim().toLowerCase()
  const mimeType = input.mimeType?.trim().toLowerCase()
  return kind === 'image' || mimeType?.startsWith('image/') === true
}

function agentChatTextElementLabel(element: unknown, inputIndex: number, elementIndex: number): string[] {
  if (!element || typeof element !== 'object') return [`Input ${inputIndex + 1}.${elementIndex + 1}: ${String(element)}`]
  const record = element as Record<string, unknown>
  const placeholder = stringValue(record.placeholder)
  const type = stringValue(record.type)
  const path = stringValue(record.path)
  const byteRange = textElementByteRange(record.byteRange)
  const parts = [
    `Input ${inputIndex + 1}.${elementIndex + 1}`,
    placeholder ? `placeholder: ${placeholder}` : '',
    type ? `type: ${type}` : '',
    path ? `path: ${path}` : '',
    byteRange ? `bytes: ${byteRange}` : '',
  ].filter(Boolean)
  return parts.length > 1 ? [parts.join(' / ')] : []
}

function textElementByteRange(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const start = numberValue(record.start) ?? numberValue(record.from) ?? numberValue(record[0])
  const end = numberValue(record.end) ?? numberValue(record.to) ?? numberValue(record[1])
  return start !== undefined && end !== undefined ? `${start}-${end}` : undefined
}

function agentChatMessagePhaseLabel(phase: string): string {
  if (phase === 'final_answer') return 'final answer'
  return phase
}

function agentChatMemoryCitationSummary(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const entries = Array.isArray(record.entries) ? record.entries : []
  const threadIds = Array.isArray(record.threadIds) ? record.threadIds.flatMap((threadId) => stringValue(threadId) ?? []) : []
  return [
    ...entries.flatMap((entry, index) => agentChatMemoryCitationEntryLabel(entry, index)),
    ...threadIds.map((threadId) => `Thread: ${threadId}`),
  ]
}

function agentChatMemoryCitationEntryLabel(value: unknown, index: number): string[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const path = stringValue(record.path)
  const lineStart = numberValue(record.lineStart)
  const lineEnd = numberValue(record.lineEnd)
  const note = stringValue(record.note)
  return [
    [
      `${index + 1}.`,
      path ?? 'memory',
      lineStart !== undefined && lineEnd !== undefined ? `:${lineStart}-${lineEnd}` : '',
      note ? ` - ${note}` : '',
    ].join(''),
  ]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
