import type { UseAgentChatInteractionControllerInput } from '@/features/agent/presentation/useAgentChatInteractionController'
import type { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import type { useAgentChatContextState } from '@/features/agent/presentation/useAgentChatContextState'
import type { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import type { useAgentChatProviderSessionState } from '@/features/agent/presentation/useAgentChatProviderSessionState'
import type { useAgentChatStoreBindings } from '@/features/agent/presentation/useAgentChatStoreBindings'
import type { useAgentPlanDispatchSettings } from '@/features/agent/presentation/useAgentPlanDispatchSettings'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

export interface BuildAgentChatInteractionControllerInputOptions {
  activeRun: AgentRun | null
  buildingSendWorkspace: boolean
  composer: ReturnType<typeof useAgentChatComposerState>
  conversationEstablished: boolean
  context: ReturnType<typeof useAgentChatContextState>
  conv: Conversation
  externalTask?: AgentPageTaskState | null
  loading: boolean
  onExternalWorkspaceConsumed?: () => void
  pageToolRequestId?: string
  taskGraph: ReturnType<typeof useAgentPlanDispatchSettings>
  presentation: ReturnType<typeof useAgentChatPresentationState>
  providerSessionState: ReturnType<typeof useAgentChatProviderSessionState>
  store: ReturnType<typeof useAgentChatStoreBindings>
  userId: string
}

export type AgentChatActionBindingsInput = UseAgentChatInteractionControllerInput['actionBindings']
export type AgentChatSendPipelineInput = UseAgentChatInteractionControllerInput['sendPipeline']
