import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { publicModelId } from '@/shared/domain/modelDisplay'
import {
  agentRunProfilePresetIdFromExecutionSettings,
  resolveAgentChatActiveModelValue,
  updateAgentChatThreadModelOverrides,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import type {
  AgentChatRuntimeRecentCapabilityEvent,
  AgentChatThread,
  AgentChatRuntimeView,
} from '@movscript/core/agent/chat'
import type { PublicModel } from '@/types'

type AgentChatVisibleItem = AgentChatRuntimeView['visibleItems'][number]

interface UseAgentChatShellPresentationStateInput {
  activeThread: AgentChatThread | null
  activeThreadId: string | null
  error: string | null
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  modelOptions: PublicModel[]
  onSelectedModelChange?: (modelId: string | null) => void
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  selectedModelId?: string | null
  setProfilePresetId: Dispatch<SetStateAction<AgentRunProfilePresetId>>
  setThreadModelOverrides: Dispatch<SetStateAction<Record<string, string>>>
  surface: 'panel' | 'page'
  threadModelOverrides: Record<string, string>
  visibleItems: AgentChatVisibleItem[]
  visiblePendingServerRequests: unknown[]
}

export function useAgentChatShellPresentationState({
  activeThread,
  activeThreadId,
  error,
  host,
  modelOptions,
  onSelectedModelChange,
  recentCapabilityEvents,
  selectedModelId,
  setProfilePresetId,
  setThreadModelOverrides,
  surface,
  threadModelOverrides,
  visibleItems,
  visiblePendingServerRequests,
}: UseAgentChatShellPresentationStateInput) {
  const activeThreadModelValue = useMemo(() => {
    return resolveAgentChatActiveModelValue({
      modelIdForOption: publicModelId,
      modelOptions,
      selectedModelId,
      thread: activeThread,
      threadId: activeThreadId,
      threadModelOverrides,
    })
  }, [activeThread?.executionSettings?.model, activeThreadId, modelOptions, selectedModelId, threadModelOverrides])

  useEffect(() => {
    const nextProfilePresetId = agentRunProfilePresetIdFromExecutionSettings(activeThread?.executionSettings)
    if (nextProfilePresetId) setProfilePresetId(nextProfilePresetId)
  }, [
    activeThread?.executionSettings?.approvalPolicy,
    activeThread?.executionSettings?.approvalsReviewer,
    activeThread?.executionSettings?.permissions,
    setProfilePresetId,
  ])

  const handleModelChange = useCallback((modelId: string | null) => {
    onSelectedModelChange?.(modelId)
    if (!activeThreadId) return
    setThreadModelOverrides((current) => updateAgentChatThreadModelOverrides({
      current,
      modelId,
      modelIdForOption: publicModelId,
      modelOptions,
      threadId: activeThreadId,
    }))
  }, [activeThreadId, modelOptions, onSelectedModelChange, setThreadModelOverrides])

  const hasComposerActionLayer = visiblePendingServerRequests.length > 0
  const hasThreadBodyContent = Boolean(
    visibleItems.length
    || recentCapabilityEvents.length
    || error,
  )
  const hasChatContent = hasThreadBodyContent || hasComposerActionLayer
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const shellClassName = surface === 'page'
    ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell'
    : 'ai-agent-panel-shell'

  return {
    activeThreadModelValue,
    handleModelChange,
    hasChatContent,
    resolvedHost,
    shellClassName,
  }
}
