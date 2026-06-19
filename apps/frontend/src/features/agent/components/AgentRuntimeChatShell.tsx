import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgentChatDataSourceShell } from '@/features/agent/components/AgentChatDataSourceShell'
import type { AgentChatDataSourceShellLoadResult } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { useAgentThreadRegistryHydration } from '@/features/agent/application/useAgentThreadRegistryHydration'
import { publishAgentChatThreadOpen } from '@/features/agent/application/agentChatThreadBridge'
import {
  agentSettingsModelIdForProvider,
  agentSettingsModelSelectionPatch,
  useAgentStore,
} from '@/features/agent/state/agentStore'
import {
  useAgentActiveConversationId,
  useAgentConversationRecordsById,
} from '@/features/agent/state/agentConversationRegistryStore'
import {
  providerInstanceId,
  providerProtocol,
  providerRuntimeProfile,
  MOVA_PROVIDER_ID,
  type ProviderConfig,
  type MovScriptWorkspaceContext,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeModelAPIKinds } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import {
  selectActiveAgentConversationRegistryRecord,
  selectAgentConversationRegistryRecords,
} from '@movscript/core/agent'
import type { Project } from '@/types'

export const AGENT_RUNTIME_THREAD_OPEN_EVENT = 'movscript:agent-runtime-thread-open'

export interface AgentRuntimeChatShellProps {
  userId: string
  provider?: ProviderConfig
  emptyThreadLabel?: string
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  currentProject?: Project | null
  composerWorkspaceContextLocked?: boolean
  hideComposerWorkspaceProjectSelector?: boolean
  showCollapse?: boolean
  onCollapse?: () => void
}

export function AgentRuntimeChatShell({
  surface = 'panel',
  ...props
}: AgentRuntimeChatShellProps) {
  return <AgentRuntimeChatShellContent {...props} surface={surface} />
}

function AgentRuntimeChatShellContent({
  userId,
  provider,
  emptyThreadLabel,
  host,
  surface = 'panel',
  currentProject,
  composerWorkspaceContextLocked,
  hideComposerWorkspaceProjectSelector,
  showCollapse,
  onCollapse,
}: AgentRuntimeChatShellProps) {
  const settings = useAgentStore((state) => state.settings)
  const updateSettings = useAgentStore((state) => state.updateSettings)
  const modelAPIKinds = provider ? providerRuntimeModelAPIKinds(providerRuntimeProfile(provider).api) : []
  const { data: textModels = [] } = useQuery({
    queryKey: agentModelKeys.backendCatalog('runtime-chat', modelAPIKinds),
    queryFn: () => fetchAgentBackendModels({ apiKinds: modelAPIKinds }),
  })
  const providerLabel = provider?.label?.trim() || 'Agent'
  const modelProfileConfigId = provider?.id ?? settings.activeProviderProfileConfigId
  const selectedModelId = agentSettingsModelIdForProvider(settings, modelProfileConfigId)
  const loadDataSource = useCallback(async (): Promise<AgentChatDataSourceShellLoadResult> => {
    return {
      dataSource: provider
        ? await createAgentChatDataSourceForProvider(provider, {
            loadTextModels: async () => textModels,
          })
        : undefined,
    }
  }, [provider, textModels])
  const loadDataSourceForNewThread = useCallback(async (input: AgentPanelNewConversationPayload): Promise<AgentChatDataSourceShellLoadResult> => {
    if (!provider) return loadDataSource()
    return {
      dataSource: await createAgentChatDataSourceForProvider(provider, {
        loadTextModels: async () => textModels,
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
      }),
    }
  }, [loadDataSource, provider, textModels])

  const threadScopeKey = agentRuntimeThreadScopeKey(provider)
  const openThreadEventName = agentRuntimeThreadOpenEvent(provider)
  useAgentThreadRegistryHydration({
    userId,
    provider,
    enabled: Boolean(provider),
  })
  const providerIdentity = provider ? {
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: providerInstanceId(provider),
    providerProtocol: providerProtocol(provider),
  } : { providerProtocol: 'sdk' }
  const activeConversationId = useAgentActiveConversationId(userId)
  const conversationsById = useAgentConversationRecordsById()
  const activeThreadId = useMemo(() => {
    const registryState = {
      activeConversationIdsByUser: { [userId]: activeConversationId },
      conversationsById,
    }
    const activeRecord = selectActiveAgentConversationRegistryRecord(registryState, {
      userId,
      ...providerIdentity,
    })
    return activeRecord?.providerThreadId
      ?? selectAgentConversationRegistryRecords(conversationsById, {
        userId,
        ...providerIdentity,
      })[0]?.providerThreadId
      ?? null
  }, [activeConversationId, conversationsById, providerIdentity, userId])
  const readActiveThreadId = useCallback(() => activeThreadId, [activeThreadId])

  return (
    <AgentChatDataSourceShell
      userId={userId}
      loadDataSource={loadDataSource}
      loadDataSourceForNewThread={loadDataSourceForNewThread}
      dataSourceKey={threadScopeKey}
      provider={provider?.kind ?? MOVA_PROVIDER_ID}
      providerId={provider?.id}
      providerInstanceId={provider ? providerInstanceId(provider) : undefined}
      providerProtocol={provider ? providerProtocol(provider) : undefined}
      threadScopeKey={threadScopeKey}
      readActiveThreadId={readActiveThreadId}
      openThreadEventName={openThreadEventName}
      providerLabel={providerLabel}
      threadListLabel={`${providerLabel} Threads`}
      emptyThreadListLabel={`No ${providerLabel} threads yet.`}
      emptyThreadLabel={emptyThreadLabel}
      unavailableLabel={`${providerLabel} runtime is not available.`}
      composerPlaceholder="随心输入"
      newThreadLabel={`New ${providerLabel} thread`}
      composerWorkspaceContextLocked={composerWorkspaceContextLocked}
      modelOptions={textModels}
      currentProject={currentProject}
      hideComposerWorkspaceProjectSelector={hideComposerWorkspaceProjectSelector}
      selectedModelId={selectedModelId}
      onSelectedModelChange={(modelId) => updateSettings(agentSettingsModelSelectionPatch(settings, modelProfileConfigId, modelId))}
      collaborationMode={settings.collaborationMode}
      goalModeEnabled={settings.goalModeEnabled}
      onCollaborationModeChange={(collaborationMode) => updateSettings({ collaborationMode })}
      onGoalModeEnabledChange={(goalModeEnabled) => updateSettings({ goalModeEnabled })}
      host={host}
      surface={surface}
      showThreadList={false}
      autoLoadThreads={false}
      showCollapse={showCollapse}
      onCollapse={onCollapse}
    />
  )
}

export function agentRuntimeWorkspaceContextFromRoute(input: {
  projectId?: number
  pathname: string
  search: string
}): MovScriptWorkspaceContext {
  if (!input.projectId) return { scope: 'global' }
  const productionId = productionIdFromLocation(input.pathname, input.search)
  if (productionId !== undefined) {
    return {
      scope: 'production',
      projectId: input.projectId,
      productionId,
    }
  }
  return {
    scope: 'project',
    projectId: input.projectId,
  }
}

function productionIdFromLocation(pathname: string, search: string): number | undefined {
  const queryValue = new URLSearchParams(search).get('productionId') ?? new URLSearchParams(search).get('production_id')
  const queryId = positiveInteger(queryValue)
  if (queryId !== undefined) return queryId
  const pathMatch = /(?:^|\/)production(?:s)?\/(\d+)(?:\/|$)/.exec(pathname)
  return positiveInteger(pathMatch?.[1])
}

function positiveInteger(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function openAgentRuntimeThread(input: {
  threadId: string
  provider?: ProviderConfig
}): void {
  publishAgentChatThreadOpen({
    channel: agentRuntimeThreadOpenEvent(input.provider),
    threadId: input.threadId,
  })
}

export function agentRuntimeThreadScopeKey(provider?: ProviderConfig): string {
  if (!provider) return 'movscript.agentRuntime.threadScope'
  return agentRuntimeProviderScopedKey(provider, 'threadScope')
}

export function agentRuntimeThreadOpenEvent(provider?: ProviderConfig): string {
  if (!provider) return AGENT_RUNTIME_THREAD_OPEN_EVENT
  return `movscript:${agentRuntimeProviderKeySegment(provider)}-thread-open`
}

function agentRuntimeProviderScopedKey(provider: ProviderConfig, suffix: string): string {
  return `movscript.${agentRuntimeProviderKeySegment(provider)}.${suffix}`
}

function agentRuntimeProviderKeySegment(provider: ProviderConfig): string {
  return [
    provider.kind,
    provider.id.trim() || provider.kind,
    providerInstanceId(provider),
  ].map(agentRuntimeKeySegment).filter(Boolean).join('.')
}

function agentRuntimeKeySegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '_')
}
