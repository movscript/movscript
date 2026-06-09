export type AgentChatInput =
  | { type: 'text'; text: string; textElements: AgentChatTextElement[] }
  | { type: 'image'; url: string; detail?: string; name?: string; mimeType?: string; resourceId?: number }
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
  const url = normalizedString(attachment.dataUrl)
    ?? normalizedString(attachment.data_url)
    ?? normalizedString(attachment.previewUrl)
    ?? normalizedString(attachment.preview_url)
    ?? normalizedString(attachment.directUrl)
    ?? normalizedString(attachment.direct_url)
    ?? normalizedString(attachment.url)
    ?? ''
  const type = normalizedString(attachment.type)
  const mimeType = normalizedString(attachment.mimeType) ?? normalizedString(attachment.mime_type)
  const resourceId = normalizedResourceId(attachment.resourceId) ?? normalizedResourceId(attachment.resource_id)
  const name = normalizedString(attachment.name) ?? normalizedString(attachment.id) ?? (resourceId !== undefined ? `resource-${resourceId}` : 'attachment')
  const image = type === 'image' || mimeType?.startsWith('image/') === true
  if (image && url) {
    return {
      type: 'image',
      url,
      detail: 'auto',
      ...(name ? { name } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
    }
  }
  if (resourceId !== undefined) {
    return {
      type: 'mention',
      name,
      path: `resource:${resourceId}`,
      ...(type ? { kind: type } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(url ? { url } : {}),
    }
  }
  const path = normalizedString(attachment.id) ?? name
  return {
    type: 'mention',
    name,
    path,
    ...(type ? { kind: type } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(url ? { url } : {}),
  }
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizedResourceId(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}
