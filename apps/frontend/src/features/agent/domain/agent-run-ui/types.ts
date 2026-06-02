import type { AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'

export type AgentTraceCategory = 'context' | 'action' | 'impact' | 'http' | 'decision' | 'attention'

export interface AgentTraceView {
  category: AgentTraceCategory
  categoryLabel: string
  title: string
  summary?: string
  behavior?: string
  impact?: string
  contextGroups: AgentTraceContextGroup[]
  promptDetail?: AgentTracePromptDetail
  modelDetail?: AgentTraceModelDetail
  messageDetail?: AgentTraceMessageDetail
  toolDetail?: AgentTraceToolDetail
}

export interface AgentTraceContextGroup {
  label: string
  items: Array<{ label: string; value: string }>
}

export interface AgentTraceModelDetail {
  kind: 'request' | 'http' | 'result'
  title: string
  note?: string
  request?: {
    method?: string
    url?: string
    model?: string
    messageCount?: string
    toolCount?: string
    toolChoice?: string
    toolChoiceLabel?: string
    stream?: string
    headers: Array<{ name: string; value: string }>
    payload?: unknown
    submittedPayload?: unknown
    internalPayload?: unknown
  }
  messageGroups: AgentTraceModelMessageGroup[]
  messages: AgentTraceModelMessageDetail[]
  tools: AgentTraceModelToolDetail[]
  response?: {
    status?: string
    contentType?: string
    headers: Array<{ name: string; value: string }>
    content?: string
    bodyText?: string
    parsedBody?: unknown
    parsedId?: string
  }
  result?: {
    finishReason?: string
    finishReasonLabel?: string
    contentChars?: string
    inputTokens?: string
    outputTokens?: string
    toolCalls?: string
  }
}

export interface AgentTraceModelMessageDetail {
  index: number
  role: string
  roleLabel: string
  content: string
  contentChars: number
  parts: AgentTraceModelMessageContentPart[]
  imageCount: number
}

export type AgentTraceModelMessageContentPart =
  | {
    index: number
    type: 'text'
    typeLabel: string
    text: string
    chars: number
  }
  | {
    index: number
    type: 'image'
    typeLabel: string
    imageUrl?: string
    mimeType?: string
    detail?: string
    chars?: number
    metadata?: string
  }
  | {
    index: number
    type: 'metadata'
    typeLabel: string
    text: string
    chars: number
  }

export interface AgentTraceModelMessageGroup {
  role: string
  roleLabel: string
  count: number
  contentChars: number
  imageCount: number
  messages: AgentTraceModelMessageDetail[]
}

export interface AgentTraceModelToolDetail {
  index: number
  name: string
  description?: string
  parameterKeys: string[]
}

export interface AgentTraceMessageDetail {
  title: string
  messageId?: string
  source?: string
  sourceLabel?: string
  content: string
  contentChars: number
}

export interface AgentTraceToolDetail {
  title: string
  toolName?: string
  status: string
  statusLabel: string
  source?: string
  sandboxed?: string
  duration?: string
  summary?: string
  args?: unknown
  fields: AgentTraceToolField[]
}

export interface AgentTraceToolField {
  label: string
  value: string
  sensitive?: boolean
}

export interface AgentTracePromptDetail {
  title: string
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  tools: string[]
  layers: AgentTracePromptMetric[]
  contextLayers: AgentTracePromptMetric[]
  partGroups: AgentTracePromptPartGroup[]
  parts: AgentTracePromptPart[]
}

export interface AgentTracePromptMetric {
  label: string
  value: string
}

export interface AgentTracePromptPart {
  id: string
  layer?: string
  contextLayer?: string
  chars?: string
}

export interface AgentTracePromptPartGroup {
  contextLayer: string
  count: number
  chars: string
  parts: AgentTracePromptPart[]
}
