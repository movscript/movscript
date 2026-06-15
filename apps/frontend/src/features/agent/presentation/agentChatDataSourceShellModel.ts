import {
  agentChatTextInput,
  agentChatQueuedInputSummary,
  type AgentChatCollaborationMode,
  type AgentChatDataSource,
  type AgentChatInput,
  type AgentChatModelSelection,
  type AgentChatQueuedInputPreviewItem,
  type AgentChatThread,
  type AgentChatThreadControlOptions,
  type AgentThreadExecutionSettings,
} from '@movscript/core/agent/chat'
import type { AgentConversationRegistryInput, AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import {
  AGENT_RUN_PROFILE_PRESETS,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

export function agentChatConversationWorkspaceIsEmpty(workspace: { input?: string; attachments?: unknown[] } | undefined): boolean {
  return !workspace?.input?.trim() && (workspace?.attachments?.length ?? 0) === 0
}

export function agentChatComposerConversationId(threadScopeKey: string, threadId: string | null): string {
  return `${threadScopeKey}:${threadId ?? 'draft'}`
}

export function createAgentChatDraftConversationId(threadScopeKey: string): string {
  return `${threadScopeKey}:draft:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function isAgentChatDraftConversationId(conversationId: string | null | undefined): boolean {
  return Boolean(conversationId?.includes(':draft:'))
}

export function isAgentChatThread(value: unknown): value is AgentChatThread {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as AgentChatThread).id === 'string'
    && Array.isArray((value as AgentChatThread).turns),
  )
}

export function agentChatThreadIsRunning(thread: AgentChatThread): boolean {
  return thread.status === 'running' || thread.turns.some((turn) => turn.status === 'inProgress')
}

export function agentChatSourceThreadHasContent(thread: Pick<AgentChatThread, 'name' | 'preview' | 'turns'>): boolean {
  if (thread.name?.trim() || thread.preview?.trim()) return true
  return thread.turns.some((turn) => turn.items.some((item) => item.type === 'userMessage' || item.type === 'agentMessage'))
}

export function selectAgentChatInitialSourceThread(input: {
  closedThreadIds: Set<string>
  threads: AgentChatThread[]
}): AgentChatThread | undefined {
  return input.threads.find((thread) => (
    agentChatSourceThreadHasContent(thread)
    && !input.closedThreadIds.has(thread.id)
  ))
}

export function agentConversationRecordMatchesProviderIdentity(
  record: AgentConversationRegistryRecord,
  identity: {
    provider?: string
    providerId?: string
    providerInstanceId?: string
    providerProtocol?: string
  },
): boolean {
  const recordHasProviderIdentity = Boolean(record.provider || record.providerId || record.providerInstanceId || record.providerProtocol)
  if (!recordHasProviderIdentity) return true
  if (record.provider && identity.provider && record.provider !== identity.provider) return false
  if (record.providerId && identity.providerId && record.providerId !== identity.providerId) return false
  if (record.providerInstanceId && identity.providerInstanceId && record.providerInstanceId !== identity.providerInstanceId) return false
  if (record.providerProtocol && identity.providerProtocol && record.providerProtocol !== identity.providerProtocol) return false
  return true
}

export function buildAgentChatProviderIdentity(input: {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
}): {
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
} {
  return {
    provider: input.provider,
    providerId: input.providerId?.trim(),
    providerInstanceId: input.providerInstanceId?.trim(),
    providerProtocol: input.providerProtocol,
  }
}

export function buildAgentChatConversationPatchInput(input: {
  nowMs: number
  open: boolean
  provider?: string
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: string
  threadId: string
  userId: string
}): AgentConversationRegistryInput {
  return {
    userId: input.userId,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId?.trim() ? { providerId: input.providerId.trim() } : {}),
    ...(input.providerInstanceId?.trim() ? { providerInstanceId: input.providerInstanceId.trim() } : {}),
    ...(input.providerProtocol?.trim() ? { providerProtocol: input.providerProtocol } : {}),
    providerThreadId: input.threadId,
    open: input.open,
    archived: false,
    updatedAt: input.nowMs,
  }
}

export function buildAgentChatConversationRegistryIndex(input: {
  records: AgentConversationRegistryRecord[]
  userId: string
  providerIdentity: Parameters<typeof agentConversationRecordMatchesProviderIdentity>[1]
}): {
  closedThreadIds: Set<string>
  openThreadIds: Set<string>
  threadOrderIndex: Map<string, number>
} {
  const matchingRecords = input.records.filter((record) => (
    record.userId === input.userId
    && agentConversationRecordMatchesProviderIdentity(record, input.providerIdentity)
  ))
  const closedThreadIds = new Set(matchingRecords
    .filter((record) => record.open === false)
    .map((record) => record.providerThreadId))
  const openRecords = matchingRecords
    .filter((record) => record.open !== false)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    closedThreadIds,
    openThreadIds: new Set(openRecords.map((record) => record.providerThreadId)),
    threadOrderIndex: new Map(openRecords.map((record, index) => [record.providerThreadId, index])),
  }
}

export function buildAgentChatDraftThreadControlOptions(input: {
  collaborationMode: AgentChatCollaborationMode
  goalModeEnabled: boolean
}): AgentChatThreadControlOptions {
  return {
    ...(input.collaborationMode === 'plan' ? { collaborationMode: input.collaborationMode } : {}),
    ...(input.goalModeEnabled ? { goalModeEnabled: true } : {}),
  }
}

export function resolveAgentChatEmptyThreadLabel(input: {
  emptyThreadLabel?: string
  selectedProjectId?: number
  workspaceProjectOptions: Array<{ value: string; label: string }>
}): string | undefined {
  const selectedProjectLabel = input.selectedProjectId !== undefined
    ? input.workspaceProjectOptions.find((option) => option.value === String(input.selectedProjectId))?.label ?? `项目 #${input.selectedProjectId}`
    : undefined
  return selectedProjectLabel?.trim()
    ? `我们在${selectedProjectLabel.trim()}中做些什么？`
    : input.emptyThreadLabel
}

export function applyAgentChatThreadExecutionSettings(input: {
  nowSeconds: number
  settings: unknown
  threadId: string
  threads: AgentChatThread[]
}): AgentChatThread[] {
  const executionSettings = recordValue(input.settings)
  if (!executionSettings) return input.threads
  return input.threads.map((thread) => thread.id === input.threadId
    ? {
        ...thread,
        updatedAt: Math.max(thread.updatedAt, input.nowSeconds),
        executionSettings: {
          ...thread.executionSettings,
          ...executionSettings,
        },
      }
    : thread)
}

interface AgentChatModelOptionLike {
  id: number
}

export function buildAgentChatModelSelectionForRequest<TModel extends AgentChatModelOptionLike>(input: {
  baseSelection: AgentChatModelSelection
  modelIdForOption: (model: TModel) => string
  modelOptions: TModel[]
  selectedModelId?: number | null
  thread?: Pick<AgentChatThread, 'id' | 'executionSettings'> | null
  threadModelOverrides: Record<string, string>
}): AgentChatModelSelection {
  const threadModel = (input.thread?.id ? input.threadModelOverrides[input.thread.id] : undefined)
    || input.thread?.executionSettings?.model?.trim()
    || undefined
  const selectedModel = selectedAgentChatModelOption(input.modelOptions, input.selectedModelId)
  const model = selectedModel ? input.modelIdForOption(selectedModel) : undefined
  return {
    ...input.baseSelection,
    ...(threadModel || model ? { model: threadModel ?? model } : {}),
  }
}

export function resolveAgentChatActiveModelValue<TModel extends AgentChatModelOptionLike>(input: {
  modelIdForOption: (model: TModel) => string
  modelOptions: TModel[]
  selectedModelId?: number | null
  thread?: Pick<AgentChatThread, 'executionSettings'> | null
  threadId: string | null
  threadModelOverrides: Record<string, string>
}): number | null | undefined {
  const model = (input.threadId ? input.threadModelOverrides[input.threadId] : undefined)
    || input.thread?.executionSettings?.model
    || undefined
  if (!model) return input.selectedModelId
  return input.modelOptions.find((option) => input.modelIdForOption(option) === model)?.id ?? input.selectedModelId
}

export function updateAgentChatThreadModelOverrides<TModel extends AgentChatModelOptionLike>(input: {
  current: Record<string, string>
  modelId: number | null
  modelIdForOption: (model: TModel) => string
  modelOptions: TModel[]
  threadId: string | null
}): Record<string, string> {
  if (!input.threadId) return input.current
  const model = input.modelId === null ? undefined : input.modelOptions.find((option) => option.id === input.modelId)
  const next = { ...input.current }
  if (!model) delete next[input.threadId]
  else next[input.threadId] = input.modelIdForOption(model)
  return next
}

function selectedAgentChatModelOption<TModel extends AgentChatModelOptionLike>(
  modelOptions: TModel[],
  selectedModelId: number | null | undefined,
): TModel | undefined {
  if (selectedModelId === undefined || selectedModelId === null) return modelOptions[0]
  return modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0]
}

export function agentChatQueuedInputsWithText(inputs: AgentChatInput[], text: string): AgentChatInput[] {
  const trimmedText = text.trim()
  const nonTextInputs = inputs.filter((input) => input.type !== 'text')
  if (!trimmedText) return nonTextInputs
  return [agentChatTextInput(trimmedText), ...nonTextInputs]
}

export interface AgentChatQueuedInputState<Attachments = unknown, WorkspaceContext = unknown> extends AgentChatQueuedInputPreviewItem {
  threadId: string
  inputs: AgentChatInput[]
  attachments: Attachments
  workspaceContext: WorkspaceContext
  profilePresetId: AgentRunProfilePresetId
  clientUserMessageId: string
}

export function resolveAgentChatGoalObjective(input: {
  attachmentNames: Array<string | null | undefined>
  fallback: string
  text: string
}): string {
  return input.text
    || input.attachmentNames.map((name) => name?.trim()).filter(Boolean).join(', ')
    || input.fallback
}

export function buildAgentChatQueuedInputDraft<Attachments, WorkspaceContext>(input: {
  attachments: Attachments
  clientUserMessageId: string
  createdAt: number
  id: string
  inputs: AgentChatInput[]
  profilePresetId: AgentRunProfilePresetId
  text: string
  threadId: string
  workspaceContext: WorkspaceContext
}): AgentChatQueuedInputState<Attachments, WorkspaceContext> {
  return {
    id: input.id,
    threadId: input.threadId,
    text: input.text,
    inputs: input.inputs,
    attachments: input.attachments,
    workspaceContext: input.workspaceContext,
    profilePresetId: input.profilePresetId,
    clientUserMessageId: input.clientUserMessageId,
    status: 'draft',
    error: null,
    createdAt: input.createdAt,
  }
}

export function removeAgentChatQueuedInput<T extends AgentChatQueuedInputState>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

export function markAgentChatQueuedInputEditing<T extends AgentChatQueuedInputState>(items: T[], id: string): T[] {
  return items.map((item) => {
    if (item.id !== id || item.status === 'sending') return item
    return {
      ...item,
      status: 'editing',
      error: null,
    }
  })
}

export function updateAgentChatQueuedInputText<T extends AgentChatQueuedInputState>(items: T[], id: string, text: string): T[] {
  return items.map((item) => {
    if (item.id !== id || item.status === 'sending') return item
    return {
      ...item,
      text,
      inputs: agentChatQueuedInputsWithText(item.inputs, text),
      status: 'draft',
      error: null,
    }
  })
}

export function cancelAgentChatQueuedInputEdit<T extends AgentChatQueuedInputState>(items: T[], id: string): T[] {
  return items.map((item) => item.id === id && item.status === 'editing'
    ? { ...item, status: 'draft' }
    : item)
}

export function markAgentChatQueuedInputsSending<T extends AgentChatQueuedInputState>(items: T[], ids: Set<string>): T[] {
  return items.map((item) => ids.has(item.id)
    ? { ...item, status: 'sending', error: null }
    : item)
}

export function failAgentChatQueuedInputs<T extends AgentChatQueuedInputState>(items: T[], ids: Set<string>, error: string): T[] {
  return items.map((item) => ids.has(item.id)
    ? { ...item, status: 'failed', error }
    : item)
}

export function removeAgentChatQueuedInputs<T extends AgentChatQueuedInputState>(items: T[], ids: Set<string>): T[] {
  return items.filter((item) => !ids.has(item.id))
}

export function selectDraftAgentChatQueuedInputsForThread<T extends AgentChatQueuedInputState>(items: T[], threadId: string): T[] {
  return items.filter((item) => item.threadId === threadId && item.status === 'draft')
}

export interface AgentChatQueuedTurnSubmission<T extends AgentChatQueuedInputState = AgentChatQueuedInputState> {
  clientUserMessageId: string
  inputs: AgentChatInput[]
  items: T[]
  profilePresetId: AgentRunProfilePresetId
  sendingIds: Set<string>
  text: string
  threadId: string
}

export function buildAgentChatQueuedTurnSubmission<T extends AgentChatQueuedInputState>(input: {
  batchClientUserMessageId: string
  ids: Iterable<string>
  items: T[]
}): AgentChatQueuedTurnSubmission<T> | null {
  const idSet = new Set(input.ids)
  const selectedItems = input.items
    .filter((item) => idSet.has(item.id) && item.status === 'draft')
    .sort((a, b) => a.createdAt - b.createdAt)
  const firstItem = selectedItems[0]
  if (!firstItem) return null
  const threadItems = selectedItems.filter((item) => item.threadId === firstItem.threadId)
  return {
    clientUserMessageId: threadItems.length === 1
      ? threadItems[0].clientUserMessageId
      : input.batchClientUserMessageId,
    inputs: threadItems.flatMap((item) => item.inputs),
    items: threadItems,
    profilePresetId: firstItem.profilePresetId,
    sendingIds: new Set(threadItems.map((item) => item.id)),
    text: threadItems.map((item) => item.text || agentChatQueuedInputSummary(item)).filter(Boolean).join('\n\n'),
    threadId: firstItem.threadId,
  }
}

export function workspaceContextFromNewConversationPayload(
  payload: AgentPanelNewConversationPayload | undefined,
): MovScriptWorkspaceContext | undefined {
  if (payload?.workspaceContext) return payload.workspaceContext
  const projectId = positiveInteger(payload?.projectId)
  return projectId === undefined ? undefined : {
    scope: 'project',
    projectId,
  }
}

export function agentRunProfilePresetIdFromExecutionSettings(settings: AgentThreadExecutionSettings | undefined): AgentRunProfilePresetId | undefined {
  const permissions = stringValue(settings?.permissions)
  if (!permissions) return undefined
  const approvalPolicy = stringValue(settings?.approvalPolicy)
  const approvalsReviewer = stringValue(settings?.approvalsReviewer)
  const exactPreset = AGENT_RUN_PROFILE_PRESETS.find((preset) => (
    preset.permissionProfileId === permissions
    && (!approvalPolicy || preset.approvalPolicy === approvalPolicy)
    && (!approvalsReviewer || preset.approvalsReviewer === approvalsReviewer)
  ))
  return exactPreset?.id ?? AGENT_RUN_PROFILE_PRESETS.find((preset) => preset.permissionProfileId === permissions)?.id
}

export function agentThreadNeedsRunProfileSettingsSync(thread: AgentChatThread, runProfile: AgentRunProfileSelection): boolean {
  const settings = thread.executionSettings
  return stringValue(settings?.permissions) !== runProfile.permissionProfileId
    || stringValue(settings?.approvalPolicy) !== runProfile.approvalPolicy
    || stringValue(settings?.approvalsReviewer) !== runProfile.approvalsReviewer
}

export function isUnavailableThreadReadError(error: unknown): boolean {
  const message = errorMessage(error)
  return /\bthread not found:/i.test(message)
    || /\bthread not loaded:/i.test(message)
    || /\bno rollout found for thread id\b/i.test(message)
}

export function mergeAgentChatThreadListPage(current: AgentChatThread[], page: AgentChatThread[]): AgentChatThread[] {
  const existingIds = new Set(current.map((thread) => thread.id))
  return [
    ...current,
    ...page.filter((thread) => !existingIds.has(thread.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function agentChatThreadFromRegistryRecord(record: AgentConversationRegistryRecord, dataSource: AgentChatDataSource): AgentChatThread {
  const threadId = record.providerThreadId.trim()
  const title = record.title?.trim()
  return {
    provider: dataSource.provider,
    ...(threadId ? { providerThreadId: threadId } : {}),
    ...(record.providerSessionId?.trim() ? { providerSessionTreeId: record.providerSessionId.trim(), sessionId: record.providerSessionId.trim() } : {}),
    id: threadId,
    preview: title || 'Loading thread...',
    name: title || null,
    createdAt: millisecondsToUnixSeconds(record.createdAt),
    updatedAt: millisecondsToUnixSeconds(record.updatedAt),
    status: agentChatThreadStatusFromRegistryStatus(record.status),
    ...(record.providerThreadCwd?.trim() ? { cwd: record.providerThreadCwd.trim() } : {}),
    turns: [],
  }
}

export function provisionalAgentChatThread(threadId: string, dataSource: AgentChatDataSource, title?: string): AgentChatThread {
  const now = Math.floor(Date.now() / 1000)
  const normalizedTitle = title?.trim()
  return {
    provider: dataSource.provider,
    ...(dataSource.providerId ? { providerThreadId: threadId } : {}),
    ...(dataSource.providerInstanceId ? { providerSessionTreeId: dataSource.providerInstanceId } : {}),
    id: threadId,
    preview: normalizedTitle || 'Loading thread...',
    name: normalizedTitle || null,
    createdAt: now,
    updatedAt: now,
    status: 'notLoaded',
    turns: [],
  }
}

export function formatAgentChatTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

export function agentChatThreadProviderSessionState(thread: AgentChatThread): 'stopped' | 'waiting' | 'active' | 'error' {
  if (thread.status === 'running') return 'active'
  if (thread.status === 'failed') return 'error'
  return 'stopped'
}

export interface AgentChatThreadTabView {
  id: string
  messageCount: number
  sessionState: ReturnType<typeof agentChatThreadProviderSessionState>
  title: string
}

export function buildAgentChatOpenThreadCandidates(input: {
  activeThreadId: string | null
  closedThreadIds: Set<string>
  conversations: AgentConversationRegistryRecord[]
  dataSource: AgentChatDataSource | null | undefined
  openThreadIds: Set<string>
  projectId?: number
  providerIdentity: Parameters<typeof agentConversationRecordMatchesProviderIdentity>[1]
  sourceThreadList: AgentChatThread[]
  threads: AgentChatThread[]
  userId: string
}): AgentChatThread[] {
  const projectByThreadId = agentChatProjectByProviderThreadId(input.conversations)
  const sourceOpenThreads = input.sourceThreadList.filter((thread) => (
    agentChatSourceThreadHasContent(thread)
    && !input.closedThreadIds.has(thread.id)
    && agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)
  ))
  const registryOpenThreads = input.dataSource
    ? input.conversations
      .filter((record) => (
        record.userId === input.userId
        && Boolean(record.providerThreadId.trim())
        && record.open !== false
        && !record.archived
        && agentConversationRecordMatchesProviderIdentity(record, input.providerIdentity)
        && agentChatRegistryRecordMatchesProject(record, input.projectId)
      ))
      .map((record) => agentChatThreadFromRegistryRecord(record, input.dataSource as AgentChatDataSource))
    : []
  const next = new Map<string, AgentChatThread>()
  for (const thread of registryOpenThreads) next.set(thread.id, thread)
  for (const thread of sourceOpenThreads) {
    if (thread.id === input.activeThreadId || input.openThreadIds.has(thread.id)) next.set(thread.id, thread)
  }
  for (const thread of input.threads) {
    if (input.closedThreadIds.has(thread.id)) continue
    if (!agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)) continue
    if (thread.id === input.activeThreadId || input.openThreadIds.has(thread.id)) next.set(thread.id, thread)
  }
  return Array.from(next.values())
}

export function resolveAgentChatNextThreadAfterClose(input: {
  closingThreadId: string
  openThreadCandidates: AgentChatThread[]
}): AgentChatThread | undefined {
  const closingIndex = input.openThreadCandidates.findIndex((item) => item.id === input.closingThreadId)
  const remainingThreads = input.openThreadCandidates.filter((item) => item.id !== input.closingThreadId)
  return remainingThreads[Math.max(0, closingIndex - 1)] ?? remainingThreads[0]
}

export function buildAgentChatThreadTabs(input: {
  threadOrderIndex: Map<string, number>
  threads: AgentChatThread[]
}): AgentChatThreadTabView[] {
  return input.threads
    .map((thread, index) => ({ thread, index }))
    .sort((a, b) => {
      const aOrder = input.threadOrderIndex.get(a.thread.id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = input.threadOrderIndex.get(b.thread.id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || a.index - b.index
    })
    .map(({ thread }) => ({
      id: thread.id,
      title: thread.name || thread.preview || 'Untitled thread',
      messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
      sessionState: agentChatThreadProviderSessionState(thread),
    }))
}

export function selectAgentChatClosedHistoryThreads(input: {
  closedThreadIds: Set<string>
  conversations?: AgentConversationRegistryRecord[]
  projectId?: number
  sourceThreadList: AgentChatThread[]
}): AgentChatThread[] {
  const projectByThreadId = agentChatProjectByProviderThreadId(input.conversations ?? [])
  return input.sourceThreadList.filter((thread) => (
    agentChatSourceThreadHasContent(thread)
    && input.closedThreadIds.has(thread.id)
    && agentChatThreadMatchesProject(thread, input.projectId, projectByThreadId)
  ))
}

function agentChatProjectByProviderThreadId(records: AgentConversationRegistryRecord[]): Map<string, number> {
  const next = new Map<string, number>()
  for (const record of records) {
    const threadId = record.providerThreadId?.trim()
    if (!threadId || typeof record.projectId !== 'number') continue
    next.set(threadId, record.projectId)
  }
  return next
}

function agentChatRegistryRecordMatchesProject(record: AgentConversationRegistryRecord, projectId: number | undefined): boolean {
  return projectId === undefined || record.projectId === projectId
}

function agentChatThreadMatchesProject(thread: Pick<AgentChatThread, 'id' | 'cwd'>, projectId: number | undefined, projectByThreadId: Map<string, number>): boolean {
  if (projectId === undefined) return true
  const registryProjectId = projectByThreadId.get(thread.id)
  if (registryProjectId !== undefined) return registryProjectId === projectId
  return agentChatProjectIdFromThreadCwd(thread.cwd) === projectId
}

function agentChatProjectIdFromThreadCwd(cwd: string | null | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)\.movscript\/(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
    ?? /(?:^|\/)(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  const projectId = Number(match?.[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function agentChatThreadStatusFromRegistryStatus(status: string | undefined): AgentChatThread['status'] {
  if (status === 'idle' || status === 'running' || status === 'requires_action' || status === 'failed' || status === 'completed' || status === 'cancelled' || status === 'unknown') {
    return status
  }
  return 'notLoaded'
}

function millisecondsToUnixSeconds(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value / 1000) : Math.floor(Date.now() / 1000)
}
