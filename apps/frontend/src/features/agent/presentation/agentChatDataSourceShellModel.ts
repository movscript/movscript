import {
  type AgentChatCollaborationMode,
  type AgentChatModelSelection,
  type AgentChatThread,
  type AgentChatThreadControlOptions,
  type AgentThreadExecutionSettings,
} from '@movscript/core/agent/chat'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import {
  AGENT_RUN_PROFILE_PRESETS,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'

export type {
  AgentChatThreadTabView,
} from '@/features/agent/presentation/agentChatThreadProjectionModel'
export {
  agentChatSourceThreadHasContent,
  agentChatThreadFromRegistryRecord,
  agentChatThreadProviderSessionState,
  agentConversationRecordMatchesProviderIdentity,
  buildAgentChatConversationPatchInput,
  buildAgentChatConversationRegistryIndex,
  buildAgentChatOpenThreadCandidates,
  buildAgentChatProviderIdentity,
  buildAgentChatThreadTabs,
  formatAgentChatTime,
  mergeAgentChatThreadListPage,
  provisionalAgentChatThread,
  resolveAgentChatEmptyThreadLabel,
  resolveAgentChatNextThreadAfterClose,
  selectAgentChatClosedHistoryThreads,
  selectAgentChatInitialSourceThread,
} from '@/features/agent/presentation/agentChatThreadProjectionModel'

export type {
  AgentChatQueuedInputState,
  AgentChatQueuedTurnSubmission,
} from '@/features/agent/presentation/agentChatQueuedInputModel'
export {
  agentChatQueuedInputsWithText,
  buildAgentChatQueuedInputDraft,
  buildAgentChatQueuedTurnSubmission,
  cancelAgentChatQueuedInputEdit,
  failAgentChatQueuedInputs,
  markAgentChatQueuedInputEditing,
  markAgentChatQueuedInputsSending,
  removeAgentChatQueuedInput,
  removeAgentChatQueuedInputs,
  resolveAgentChatGoalObjective,
  selectDraftAgentChatQueuedInputsForThread,
  updateAgentChatQueuedInputText,
} from '@/features/agent/presentation/agentChatQueuedInputModel'

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

export function buildAgentChatDraftThreadControlOptions(input: {
  collaborationMode: AgentChatCollaborationMode
  goalModeEnabled: boolean
}): AgentChatThreadControlOptions {
  return {
    ...(input.collaborationMode === 'plan' ? { collaborationMode: input.collaborationMode } : {}),
    ...(input.goalModeEnabled ? { goalModeEnabled: true } : {}),
  }
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
  is_default?: boolean
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
  const defaultModel = modelOptions.find((model) => model.is_default) ?? modelOptions[0]
  if (selectedModelId === undefined || selectedModelId === null) return defaultModel
  return modelOptions.find((model) => model.id === selectedModelId) ?? defaultModel
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
