import {
  agentChatQueuedInputSummary,
  agentChatTextInput,
  type AgentChatInput,
  type AgentChatQueuedInputPreviewItem,
} from '@movscript/core/agent/chat'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'

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
