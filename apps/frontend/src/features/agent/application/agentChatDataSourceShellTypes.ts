import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import type {
  AgentChatCollaborationMode,
  AgentChatDataSource,
  AgentChatModelSelection,
} from '@movscript/core/agent/chat'
import type { ProviderKind, ProviderProtocol } from '@/shared/infrastructure/providerConfigStore'
import type { Project, PublicModel } from '@/types'

export interface AgentChatDataSourceShellLoadResult {
  dataSource?: AgentChatDataSource
  endpoint?: string
}

export interface AgentChatDataSourceShellProps {
  userId: string
  loadDataSource: () => Promise<AgentChatDataSourceShellLoadResult>
  loadDataSourceForNewThread?: (input: AgentPanelNewConversationPayload) => Promise<AgentChatDataSourceShellLoadResult>
  provider?: ProviderKind
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: ProviderProtocol
  threadScopeKey: string
  readActiveThreadId?: () => string | null
  openThreadEventName: string
  providerLabel: string
  threadListLabel: string
  emptyThreadListLabel: string
  emptyThreadLabel?: string
  unavailableLabel: string
  composerPlaceholder: string
  newThreadLabel: string
  composerWorkspaceContextLocked?: boolean
  resolveModelForRequest?: () => AgentChatModelSelection
  modelOptions?: PublicModel[]
  currentProject?: Project | null
  hideComposerWorkspaceProjectSelector?: boolean
  selectedModelId?: number | null
  onSelectedModelChange?: (modelId: number | null) => void
  collaborationMode?: AgentChatCollaborationMode
  goalModeEnabled?: boolean
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showThreadList?: boolean
  autoLoadThreads?: boolean
  showCollapse?: boolean
  onCollapse?: () => void
}
