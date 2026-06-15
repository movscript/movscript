import type { AgentTraceEvent } from '@/shared/infrastructure/provider-session-client/coreTypes'

export type ProviderSessionTraceRef = { kind: 'context_bundle' | 'context' | 'content_hash' | 'result_hash'; label: string; key?: string; id?: string; type?: string; hash?: string }
export type ProviderSessionTraceContextMutation = { eventId: string; title: string; total: number; appended: number; amended: number; deleted: number; affectedContextKeys: string[]; appendedContextKeys: string[]; amendedContextKeys: string[]; deletedContextKeys: string[]; latest?: { id: string; type: 'append' | 'amend' | 'delete'; createdAt: string; reason?: string }; refs: ProviderSessionTraceRef[] }

export interface ProviderSessionTraceHistoryProjection {
  inputCount: number
  retainedCount: number
  compactedCount: number
  filteredCount: number
  summaryChars: number
  decisions: Array<Record<string, unknown>>
}

export type ProviderSessionTraceGenericProjection = Record<string, unknown> & { decisions: Array<Record<string, unknown>> }

export type ProviderSessionTraceRoundContextProjection = Record<string, unknown> & {
  eventId: string
  title: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  messageCount?: string
  systemMessageCount?: string
  promptChars?: string
  contextBundle?: ProviderSessionTraceRef
  historyProjection?: ProviderSessionTraceHistoryProjection
  toolLoopProjection?: ProviderSessionTraceGenericProjection
  historicalVisualProjection?: ProviderSessionTraceGenericProjection
  attachmentProjection?: ProviderSessionTraceGenericProjection
}

export interface ProviderSessionTraceSkillOmission {
  skillId: string
  name: string
  stage: string
  reason: string
  matched?: boolean
  selected?: boolean
  triggerReason?: string
  dependencyIds: string[]
  missingDependencyIds: string[]
  inactiveDependencyIds: string[]
  conflictSkillIds: string[]
}

export interface ProviderSessionTraceSkillContextProjection {
  skillId: string
  name: string
  activationReason?: string
  contextBehavior?: string
  includedInPrompt: boolean
  promptPartId?: string
  promptLayer?: string
  promptKind?: string
  renderedChars?: string
  omittedReason?: string
  omittedStage?: string
  originalChars?: string
  priority?: string
}

export interface ProviderSessionTracePromptDetail {
  eventId: string
  title: string
  contextBundle?: ProviderSessionTraceRef
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  skillContextProjection: ProviderSessionTraceSkillContextProjection[]
  tools: string[]
  layers: Array<{ label: string; value: string }>
  contextLayers: Array<{ label: string; value: string }>
  partGroups: Array<{ contextLayer: string; count: number; chars: string; partIds: string[] }>
  parts: Array<{ id: string; layer?: string; contextLayer?: string; chars?: string }>
  budgetDecisions: Array<{ action: string; stage?: string; partId: string; reason?: string; originalChars?: string; renderedChars?: string }>
  historyProjection?: ProviderSessionTraceHistoryProjection
  toolLoopProjection?: ProviderSessionTraceGenericProjection
  historicalVisualProjection?: ProviderSessionTraceGenericProjection
  attachmentProjection?: ProviderSessionTraceGenericProjection
  runtimeSkillState?: {
    activeSkillIds: string[]
    loadedSkillIds: string[]
    unloadedSkillIds: string[]
    availableSkillIds: string[]
    omissions: ProviderSessionTraceSkillOmission[]
    sourceEventId?: string
  }
  contextLedgerState?: {
    mutationCount: number
    mutationEventIds: string[]
    latestMutationEventId?: string
    latestMutationReason?: string
  }
}

export type ProviderSessionTraceSkillEntry = {
  eventId: string
  createdAt: string
  eventType: string
  title: string
  summary?: string
  activeSkillIds: string[]
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  availableSkillIds: string[]
  omissions: ProviderSessionTraceSkillOmission[]
}

export interface ProviderSessionTraceModelCall {
  id: string
  label: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  correlateByEventWindow?: boolean
  eventIds: string[]
  status: 'complete' | 'request_only' | 'response_only' | 'result_only' | 'failed'
  statusLabel: string
  requestEventId?: string
  responseEventId?: string
  resultEventId?: string
  model?: string
  messageCount?: string
  toolCount?: string
  httpStatus?: string
  latency?: string
  responseChars?: string
  inputTokens?: string
  outputTokens?: string
  retryCount?: string
  error?: string
  issue?: string
  hasRequestPayload: boolean
  hasResponseBody: boolean
}

export interface ProviderSessionTraceModelCallContext {
  callId: string
  label: string
  status: ProviderSessionTraceModelCall['status']
  statusLabel: string
  correlationLabel: string
  requestEventId?: string
  responseEventId?: string
  resultEventId?: string
  modelEventIds: string[]
  toolCalls: Array<{ eventId: string; toolName?: string; status: string; statusLabel: string; summary?: string }>
  messageWrites: Array<{ eventId: string; messageId?: string; source?: string; sourceLabel?: string; contentChars: number; contentPreview?: string }>
  issue?: string
}

export interface ProviderSessionTraceToolCall {
  eventId: string
  toolName?: string
  title: string
  status: AgentTraceEvent['status']
  statusLabel: string
  source?: string
  sandboxed?: boolean
  durationMs?: number
  summary?: string
  argsPreview?: string
  dataPreview?: string
  resultHash?: string
  resultChars?: number
  refs: ProviderSessionTraceRef[]
}

export interface ProviderSessionTraceMessageWrite {
  eventId: string
  messageId?: string
  source?: string
  sourceLabel?: string
  contentChars: number
  contentPreview?: string
  contentHash?: string
  refs: ProviderSessionTraceRef[]
}
