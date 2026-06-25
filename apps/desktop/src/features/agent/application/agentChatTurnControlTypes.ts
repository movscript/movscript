import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type {
  AgentChatCollaborationMode,
  AgentChatDataSource,
  AgentChatModelSelection,
  AgentChatRuntimeAction,
  AgentChatRuntimeState,
  AgentChatRuntimeView,
  AgentChatThread,
  AgentChatThreadReadInput,
  AgentChatTurn,
} from '@movscript/agent-chat'
import type {
  AgentRunProfilePresetId,
  AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import type {
  AgentChatStartThreadInput,
  AgentChatStartThreadResult,
} from '@/features/agent/application/useAgentChatThreadCreation'
import type { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import type { AgentComposerQueuedInput } from '@/features/agent/application/useAgentChatQueuedInputControls'

type AgentComposerController = ReturnType<typeof useAgentComposerController>

export type AgentChatVisibleItem = AgentChatRuntimeView['visibleItems'][number]

export interface AgentChatTurnControlsInput {
  activeThread: AgentChatThread | null
  activeTurn: AgentChatTurn | null
  collaborationMode: AgentChatCollaborationMode
  composer: AgentComposerController
  composerConversationId: string
  composerInputRef: RefObject<HTMLDivElement | null>
  composerPlaceholder: string
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  goalModeEnabled: boolean
  markThreadFailed: (threadId: string, error?: string) => void
  markThreadReady: (threadId: string) => void
  profilePresetId: AgentRunProfilePresetId
  providerLabel: string
  queuedInputs: AgentComposerQueuedInput[]
  runtimeRef: MutableRefObject<AgentChatRuntimeState>
  selectedModelSelectionForRequest: (thread?: AgentChatThread | null) => AgentChatModelSelection
  sendDisabledReason?: string
  sending: boolean
  setError: Dispatch<SetStateAction<string | null>>
  setQueuedInputs: Dispatch<SetStateAction<AgentComposerQueuedInput[]>>
  setQueuedInputsCollapsed: Dispatch<SetStateAction<boolean>>
  setSending: Dispatch<SetStateAction<boolean>>
  setOptimisticUserItems: Dispatch<SetStateAction<AgentChatRuntimeView['visibleItems']>>
  setStoppingTurn: Dispatch<SetStateAction<boolean>>
  startThreadResult: (input?: AgentChatStartThreadInput) => Promise<AgentChatStartThreadResult | null>
  stoppingTurn: boolean
  syncThreadRunProfileSettingsForTurn: (
    dataSource: AgentChatDataSource,
    thread: AgentChatThread,
    runProfile: AgentRunProfileSelection,
  ) => Promise<void>
  threadScopeKey: string
  upsertThread: (thread: AgentChatThread) => void
  upsertThreadReadResult: (thread: AgentChatThread, input: AgentChatThreadReadInput) => void
  userId: string
}

export function upsertAgentChatOptimisticUserItem(
  items: AgentChatVisibleItem[],
  item: AgentChatVisibleItem,
): AgentChatVisibleItem[] {
  const existingIndex = items.findIndex((candidate) => candidate.viewId === item.viewId)
  if (existingIndex < 0) return [...items, item]
  return items.map((candidate, index) => (index === existingIndex ? item : candidate))
}

export function removeAgentChatOptimisticUserItem(
  items: AgentChatVisibleItem[],
  viewId: string,
): AgentChatVisibleItem[] {
  return items.filter((item) => item.viewId !== viewId)
}
