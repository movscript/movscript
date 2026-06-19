import type { AgentAttachmentSource } from '../agentAttachmentProtocol.js'
import { isModelReachableRemoteUrl } from '../attachmentInputs.js'

export type AgentChatInput =
  | { type: 'text'; text: string; textElements: AgentChatTextElement[] }
  | { type: 'image'; url: string; detail?: string; name?: string; mimeType?: string; resourceId?: number; source?: AgentAttachmentSource }
  | { type: 'localImage'; path: string; detail?: string; url?: string }
  | { type: 'skill'; name: string; path: string }
  | { type: 'mention'; name: string; path: string; kind?: string; mimeType?: string; url?: string }

export type AgentChatTextElement = Record<string, unknown>

export interface AgentChatAttachmentInputRef {
  id?: string
  name?: string
  type?: string
  mimeType?: string
  mime_type?: string
  resourceId?: number | string
  resource_id?: number | string
  dataUrl?: string
  data_url?: string
  previewUrl?: string
  preview_url?: string
  directUrl?: string
  direct_url?: string
  url?: string
  source?: AgentAttachmentSource
}

export interface AgentChatHookPromptFragment {
  text: string
  hookRunId: string
}

export interface AgentChatCommandAction {
  type: string
  command?: string
  name?: string
  path?: string | null
  query?: string | null
  raw?: unknown
}

export interface AgentChatCollabAgentState {
  status: string
  message: string | null
}

export interface AgentChatTerminalInteraction {
  processId: string
  stdin: string
  raw?: unknown
}

export interface AgentChatPlanStep {
  text: string
  status: string
  raw?: unknown
}

export type AgentChatThreadItem =
  | { type: 'userMessage'; id: string; clientId: string | null; content: AgentChatInput[]; raw?: unknown }
  | { type: 'hookPrompt'; id: string; fragments: AgentChatHookPromptFragment[]; raw?: unknown }
  | { type: 'agentMessage'; id: string; text: string; phase: string | null; memoryCitation: unknown | null; raw?: unknown }
  | { type: 'plan'; id: string; text: string; items?: AgentChatPlanStep[]; raw?: unknown }
  | {
    type: 'reasoning'
    id: string
    title?: string | null
    status?: string | null
    source?: string | null
    roundId?: string | null
    roundIndex?: number | null
    roundLabel?: string | null
    summary: string[]
    content: string[]
    result?: unknown
    error?: unknown
    durationMs?: number | null
    raw?: unknown
  }
  | {
    type: 'commandExecution'
    id: string
    command: string
    cwd?: string
    processId?: string | null
    source?: string
    status?: string
    commandActions?: AgentChatCommandAction[]
    terminalInteractions?: AgentChatTerminalInteraction[]
    aggregatedOutput: string | null
    exitCode?: number | null
    durationMs?: number | null
    raw?: unknown
  }
  | { type: 'fileChange'; id: string; status?: string; changes?: unknown[]; raw?: unknown }
  | {
    type: 'mcpToolCall'
    id: string
    server: string
    tool: string
    status?: string
    roundId?: string | null
    roundIndex?: number | null
    roundLabel?: string | null
    arguments?: unknown
    mcpAppResourceUri?: string
    pluginId?: string | null
    result?: unknown
    error?: unknown
    progressMessages?: string[]
    durationMs?: number | null
    raw?: unknown
  }
  | {
    type: 'dynamicToolCall'
    id: string
    namespace: string | null
    tool: string
    status?: string
    roundId?: string | null
    roundIndex?: number | null
    roundLabel?: string | null
    arguments?: unknown
    contentItems?: unknown[] | null
    result?: unknown
    error?: unknown
    success?: boolean | null
    sandboxed?: boolean | null
    durationMs?: number | null
    raw?: unknown
  }
  | {
    type: 'collabAgentToolCall'
    id: string
    tool: string
    status: string
    senderThreadId: string
    receiverThreadIds: string[]
    prompt: string | null
    model: string | null
    reasoningEffort: string | null
    agentsStates: Record<string, AgentChatCollabAgentState>
    raw?: unknown
  }
  | { type: 'webSearch'; id: string; query: string; action?: unknown; raw?: unknown }
  | { type: 'imageView'; id: string; path: string; url?: string; raw?: unknown }
  | { type: 'imageGeneration'; id: string; status: string; revisedPrompt?: string | null; result: string; url?: string; savedPath?: string; raw?: unknown }
  | { type: 'reviewMode'; id: string; action: 'entered' | 'exited'; review: string; raw?: unknown }
  | {
    type: 'systemNotice'
    id: string
    level: 'info' | 'warning' | 'error' | (string & {})
    title: string
    detail?: string | null
    code?: string
    threadId?: string
    turnId?: string
    raw?: unknown
  }
  | {
    type: 'approvalReview'
    id: string
    reviewId: string
    lifecycle: 'started' | 'completed' | (string & {})
    targetItemId: string | null
    startedAtMs: number | null
    completedAtMs?: number | null
    reviewStatus?: string | null
    riskLevel?: string | null
    rationale?: string | null
    decisionSource?: string | null
    action?: unknown
    review?: unknown
    raw?: unknown
  }
  | { type: 'contextCompaction'; id: string; raw?: unknown }
  | { type: 'unknown'; id: string; providerType: string; raw: unknown }

export function agentChatTextInput(text: string): AgentChatInput {
  return { type: 'text', text, textElements: [] }
}

export function agentChatInputsFromTextAndAttachments(text: string, attachments: AgentChatAttachmentInputRef[]): AgentChatInput[] {
  const inputs: AgentChatInput[] = []
  if (text.trim()) inputs.push(agentChatTextInput(text))
  for (const attachment of attachments) {
    const input = agentChatInputFromAttachment(attachment)
    if (input) inputs.push(input)
  }
  return inputs
}

export function agentChatInputFromAttachment(attachment: AgentChatAttachmentInputRef): AgentChatInput | null {
  const dataUrl = normalizedString(attachment.dataUrl)
    ?? normalizedString(attachment.data_url)
    ?? (attachment.source?.kind === 'inline_data' ? normalizedString(attachment.source.dataUrl) : undefined)
  const displayUrl = normalizedString(attachment.previewUrl)
    ?? normalizedString(attachment.preview_url)
    ?? normalizedString(attachment.directUrl)
    ?? normalizedString(attachment.direct_url)
    ?? normalizedString(attachment.url)
    ?? (attachment.source?.kind === 'display_url' || attachment.source?.kind === 'remote_url' ? normalizedString(attachment.source.url) : undefined)
    ?? ''
  const type = normalizedString(attachment.type)
  const mimeType = normalizedString(attachment.mimeType) ?? normalizedString(attachment.mime_type)
  const resourceId = normalizedResourceId(attachment.resourceId)
    ?? normalizedResourceId(attachment.resource_id)
    ?? (attachment.source?.kind === 'backend_resource' ? normalizedResourceId(attachment.source.resourceId) : undefined)
  const name = normalizedString(attachment.name) ?? normalizedString(attachment.id) ?? (resourceId !== undefined ? `resource-${resourceId}` : 'attachment')
  const image = type === 'image' || mimeType?.startsWith('image/') === true
  const imageUrl = dataUrl ?? (isModelReachableRemoteUrl(displayUrl) ? displayUrl : undefined)
  if (image && attachment.source?.kind === 'local_path') {
    return {
      type: 'localImage',
      path: attachment.source.path,
      detail: 'auto',
      ...(displayUrl ? { url: displayUrl } : {}),
    }
  }
  if (image && imageUrl) {
    return {
      type: 'image',
      url: imageUrl,
      detail: 'auto',
      ...(name ? { name } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(attachment.source ? { source: attachment.source } : {}),
    }
  }
  if (resourceId !== undefined) {
    return {
      type: 'mention',
      name,
      path: `resource:${resourceId}`,
      ...(type ? { kind: type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(displayUrl ? { url: displayUrl } : {}),
    }
  }
  const path = normalizedString(attachment.id) ?? name
  return {
    type: 'mention',
    name,
    path,
    ...(type ? { kind: type } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(displayUrl ? { url: displayUrl } : {}),
  }
}

export interface CompactAgentChatRuntimePayloadOptions {
  inlineMediaStringMaxLength?: number
  maxDepth?: number
}

export const AGENT_CHAT_INLINE_MEDIA_STRING_MAX_LENGTH = 4096
const AGENT_CHAT_RUNTIME_RAW_MAX_DEPTH = 8

export function compactAgentChatThreadItemForRuntime(
  item: AgentChatThreadItem,
  options: CompactAgentChatRuntimePayloadOptions = {},
): AgentChatThreadItem {
  const raw = 'raw' in item ? compactAgentChatRuntimePayload(item.raw, options) : undefined
  switch (item.type) {
    case 'userMessage':
      return { ...item, content: item.content.map((input) => compactAgentChatInputForRuntime(input, options)), ...(raw !== undefined ? { raw } : {}) }
    case 'imageGeneration':
      return { ...item, result: compactAgentChatImageGenerationResult(item.result), ...(raw !== undefined ? { raw } : {}) }
    case 'unknown':
      return { ...item, raw: compactAgentChatRuntimePayload(item.raw, options) }
    default:
      return raw !== undefined ? { ...item, raw } : item
  }
}

export function compactAgentChatInputForRuntime(
  input: AgentChatInput,
  options: CompactAgentChatRuntimePayloadOptions = {},
): AgentChatInput {
  if (input.type !== 'image') return input
  const normalizedOptions = normalizeCompactAgentChatRuntimePayloadOptions(options)
  const source = input.source?.kind === 'inline_data'
    ? { ...input.source, dataUrl: compactAgentChatRuntimeInlineMediaString(input.source.dataUrl, normalizedOptions) }
    : input.source
  return {
    ...input,
    ...(source ? { source } : {}),
  }
}

export function compactAgentChatRuntimePayload(
  value: unknown,
  options: CompactAgentChatRuntimePayloadOptions = {},
): unknown {
  return compactAgentChatRuntimePayloadValue(value, normalizeCompactAgentChatRuntimePayloadOptions(options), 0)
}

function normalizeCompactAgentChatRuntimePayloadOptions(
  options: CompactAgentChatRuntimePayloadOptions,
): Required<CompactAgentChatRuntimePayloadOptions> {
  return {
    inlineMediaStringMaxLength: normalizedPositiveInteger(options.inlineMediaStringMaxLength)
      ?? AGENT_CHAT_INLINE_MEDIA_STRING_MAX_LENGTH,
    maxDepth: normalizedPositiveInteger(options.maxDepth) ?? AGENT_CHAT_RUNTIME_RAW_MAX_DEPTH,
  }
}

export function agentChatInlineMediaPayloadSummary(value: string): string | undefined {
  const dataUrl = /^data:((?:image|video|audio)\/[^;,]+)(?:;[^,]*)?,(.*)$/is.exec(value.trim())
  if (dataUrl?.[1]) {
    return `inline ${dataUrl[1]} data (${dataUrl[2]?.length ?? 0} chars)`
  }
  if (looksLikeBase64Payload(value)) return `inline media data (base64, ${value.trim().length} chars)`
  return undefined
}

function compactAgentChatRuntimePayloadValue(
  value: unknown,
  options: Required<CompactAgentChatRuntimePayloadOptions>,
  depth: number,
): unknown {
  if (typeof value === 'string') return compactAgentChatRuntimeInlineMediaString(value, options)
  if (!value || typeof value !== 'object') return value
  if (depth >= options.maxDepth) return '[object truncated]'
  if (Array.isArray(value)) return value.map((item) => compactAgentChatRuntimePayloadValue(item, options, depth + 1))
  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    next[key] = compactAgentChatRuntimePayloadValue(entry, options, depth + 1)
  }
  return next
}

function compactAgentChatRuntimeInlineMediaString(
  value: string,
  options: Required<Pick<CompactAgentChatRuntimePayloadOptions, 'inlineMediaStringMaxLength'>>,
): string {
  if (value.length <= options.inlineMediaStringMaxLength) return value
  const summary = agentChatInlineMediaPayloadSummary(value)
  return summary ? `[${summary} redacted from runtime payload]` : value
}

function compactAgentChatImageGenerationResult(result: string): string {
  const summary = agentChatInlineMediaPayloadSummary(result)
  return summary ?? result
}

function looksLikeBase64Payload(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < AGENT_CHAT_INLINE_MEDIA_STRING_MAX_LENGTH) return false
  if (trimmed.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)
}

function normalizedPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizedResourceId(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}
