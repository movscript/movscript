import type { UseAgentChatInteractionControllerInput } from '@/features/agent/presentation/useAgentChatInteractionController'
import type { useAgentChatComposerState } from '@/features/agent/presentation/useAgentChatComposerState'
import type { useAgentChatContextState } from '@/features/agent/presentation/useAgentChatContextState'
import type { useAgentChatPresentationState } from '@/features/agent/presentation/useAgentChatPresentationState'
import type { useAgentChatRuntimeState } from '@/features/agent/presentation/useAgentChatRuntimeState'
import type { useAgentChatStoreBindings } from '@/features/agent/presentation/useAgentChatStoreBindings'
import type { useAgentPlanDispatchSettings } from '@/features/agent/presentation/useAgentPlanDispatchSettings'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'

export interface BuildAgentChatInteractionControllerInputOptions {
  activeLocalRun: AgentRun | null
  buildingSendWorkspace: boolean
  composer: ReturnType<typeof useAgentChatComposerState>
  context: ReturnType<typeof useAgentChatContextState>
  conv: Conversation
  externalTask?: AgentPageTaskState | null
  loading: boolean
  onExternalWorkspaceConsumed?: () => void
  pageToolRequestId?: string
  taskGraph: ReturnType<typeof useAgentPlanDispatchSettings>
  presentation: ReturnType<typeof useAgentChatPresentationState>
  runtime: ReturnType<typeof useAgentChatRuntimeState>
  store: ReturnType<typeof useAgentChatStoreBindings>
  userId: string
}

export type AgentChatActionBindingsInput = UseAgentChatInteractionControllerInput['actionBindings']
export type AgentChatSendPipelineInput = UseAgentChatInteractionControllerInput['sendPipeline']
