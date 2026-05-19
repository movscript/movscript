import type { UseAgentChatInteractionControllerInput } from '@/components/agent/useAgentChatInteractionController'
import type { useAgentChatComposerState } from '@/components/agent/useAgentChatComposerState'
import type { useAgentChatContextState } from '@/components/agent/useAgentChatContextState'
import type { useAgentChatPresentationState } from '@/components/agent/useAgentChatPresentationState'
import type { useAgentChatRuntimeState } from '@/components/agent/useAgentChatRuntimeState'
import type { useAgentChatStoreBindings } from '@/components/agent/useAgentChatStoreBindings'
import type { useAgentPlanDispatchSettings } from '@/components/agent/useAgentPlanDispatchSettings'
import type { AgentRun } from '@/lib/localAgentClient'
import type { Conversation } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'

export interface BuildAgentChatInteractionControllerInputOptions {
  activeLocalRun: AgentRun | null
  buildingSendDraft: boolean
  composer: ReturnType<typeof useAgentChatComposerState>
  context: ReturnType<typeof useAgentChatContextState>
  conv: Conversation
  externalTask?: AgentPageTaskState | null
  loading: boolean
  onExternalDraftConsumed?: () => void
  pageToolRequestId?: string
  plan: ReturnType<typeof useAgentPlanDispatchSettings>
  presentation: ReturnType<typeof useAgentChatPresentationState>
  runtime: ReturnType<typeof useAgentChatRuntimeState>
  store: ReturnType<typeof useAgentChatStoreBindings>
  userId: string
}

export type AgentChatActionBindingsInput = UseAgentChatInteractionControllerInput['actionBindings']
export type AgentChatSendPipelineInput = UseAgentChatInteractionControllerInput['sendPipeline']
