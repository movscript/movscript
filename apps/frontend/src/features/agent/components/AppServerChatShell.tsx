import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentChatDataSourceShell,
  type AgentChatDataSourceShellLoadResult,
} from '@/features/agent/components/AgentChatDataSourceShell'
import { createAppServerChatDataSource } from '@/shared/infrastructure/app-server/appServerChatDataSource'
import {
  appServerRpcClientForURL,
  ensureAppServer,
  ensureAppServerRpcClient,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { AGENT_BACKEND_MODEL_CAPABILITY_QUERY, fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import { useAgentThreadRegistryHydration } from '@/features/agent/application/useAgentThreadRegistryHydration'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  providerInstanceId,
  providerProtocol,
  resolveAppServerProfile,
  MOVA_PROVIDER_ID,
  type ProviderConfig,
  type MovScriptWorkspaceContext,
} from '@/shared/infrastructure/providerConfigStore'
import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { selectActiveAgentConversationRegistryRecord } from '@movscript/core/agent'
import type { Project } from '@/types'

export const APP_SERVER_THREAD_OPEN_EVENT = 'movscript:app-server-thread-open'

export interface AppServerChatShellProps {
  userId: string
  provider?: ProviderConfig
  emptyThreadLabel?: string
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  currentProject?: Project | null
  showCollapse?: boolean
  onCollapse?: () => void
}

export function AppServerChatShell({
  surface = 'panel',
  ...props
}: AppServerChatShellProps) {
  return <AppServerChatShellContent {...props} surface={surface} />
}

function AppServerChatShellContent({
  userId,
  provider,
  emptyThreadLabel,
  host,
  surface = 'panel',
  currentProject,
  showCollapse,
  onCollapse,
}: AppServerChatShellProps) {
  const settings = useAgentStore((state) => state.settings)
  const updateSettings = useAgentStore((state) => state.updateSettings)
  const { data: textModels = [] } = useQuery({
    queryKey: ['models', 'agent-backend', AGENT_BACKEND_MODEL_CAPABILITY_QUERY],
    queryFn: () => fetchAgentBackendModels(),
  })
  const selectedModel = useMemo(() => {
    const modelId = settings.modelId ?? textModels[0]?.id ?? null
    return textModels.find((model) => model.id === modelId)
  }, [settings.modelId, textModels])
  const resolveModelForRequest = useCallback(() => ({
    ...(selectedModel ? { model: publicModelId(selectedModel) } : {}),
  }), [selectedModel])
  const providerLabel = provider?.label?.trim() || 'App-server Provider'
  const loadDataSource = useCallback(async (): Promise<AgentChatDataSourceShellLoadResult> => {
    if (provider) await ensureDefaultAgentProviderFromBackend({ provider, ...(textModels.length > 0 ? { models: textModels } : {}) })
    const client = await ensureAppServerRpcClient(provider)
    return appServerDataSourceLoadResult({
      clientURL: client?.url,
      provider,
      providerLabel,
      resolveModelForRequest,
    })
  }, [provider, providerLabel, resolveModelForRequest, textModels])
  const loadDataSourceForNewThread = useCallback(async (input: AgentPanelNewConversationPayload): Promise<AgentChatDataSourceShellLoadResult> => {
    if (!provider || !input.workspaceContext) return loadDataSource()
    await ensureDefaultAgentProviderFromBackend({ provider, ...(textModels.length > 0 ? { models: textModels } : {}) })
    return loadScopedAppServerDataSource({
      provider,
      providerLabel,
      resolveModelForRequest,
      workspaceContext: input.workspaceContext,
    })
  }, [loadDataSource, provider, providerLabel, resolveModelForRequest, textModels])

  const threadScopeKey = appServerThreadScopeKey(provider)
  const openThreadEventName = appServerThreadOpenEvent(provider)
  useAgentThreadRegistryHydration({
    userId,
    provider,
    enabled: Boolean(provider),
  })
  const activeThreadId = useAgentSessionStore((state) => selectActiveAgentConversationRegistryRecord(state, {
    userId,
    ...(provider ? {
      provider: provider.kind,
      providerId: provider.id,
      providerInstanceId: providerInstanceId(provider),
      providerProtocol: providerProtocol(provider),
    } : { providerProtocol: 'app-server' }),
  })?.providerThreadId ?? null)
  const readActiveThreadId = useCallback(() => activeThreadId, [activeThreadId])

  return (
    <AgentChatDataSourceShell
      userId={userId}
      loadDataSource={loadDataSource}
      loadDataSourceForNewThread={loadDataSourceForNewThread}
      provider={provider?.kind}
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
      unavailableLabel={`${providerLabel} app-server URL is not configured.`}
      composerPlaceholder="随心输入"
      newThreadLabel={`New ${providerLabel} thread`}
      modelOptions={textModels}
      currentProject={currentProject}
      selectedModelId={settings.modelId}
      onSelectedModelChange={(modelId) => updateSettings({ modelId })}
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

async function loadScopedAppServerDataSource(input: {
  provider: ProviderConfig
  providerLabel: string
  resolveModelForRequest: () => { model?: string }
  workspaceContext: MovScriptWorkspaceContext
}): Promise<AgentChatDataSourceShellLoadResult> {
  const profile = resolveAppServerProfile(input.provider)
  const status = await ensureAppServer({
    profile,
    workspaceContext: input.workspaceContext,
  })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `${input.providerLabel} app-server failed to start: ${profile.id}`)
  return appServerDataSourceLoadResult({
    clientURL: status.endpoint,
    provider: input.provider,
    providerLabel: input.providerLabel,
    resolveModelForRequest: input.resolveModelForRequest,
    defaultThreadCwd: status.providerSessionCwd,
  })
}

function appServerDataSourceLoadResult(input: {
  clientURL?: string
  provider?: ProviderConfig
  providerLabel: string
  resolveModelForRequest: () => { model?: string }
  defaultThreadCwd?: string
}): AgentChatDataSourceShellLoadResult {
  const client = input.clientURL ? appServerRpcClientForURL(input.clientURL) : undefined
  return {
    dataSource: client ? createAppServerChatDataSource(client, {
      provider: input.provider?.kind ?? MOVA_PROVIDER_ID,
      ...(input.provider ? { providerId: input.provider.id, providerInstanceId: providerInstanceId(input.provider) } : {}),
      label: input.providerLabel,
      messageAdapter: input.provider?.messageAdapter,
      ...(input.defaultThreadCwd ? { defaultThreadCwd: input.defaultThreadCwd } : {}),
      resolveModelForRequest: input.resolveModelForRequest,
    }) : undefined,
    endpoint: input.clientURL,
  }
}

export function appServerWorkspaceContextFromRoute(input: {
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

export function openAppServerThread(input: {
  threadId: string
  provider?: ProviderConfig
}): void {
  if (typeof window === 'undefined') return
  const threadId = input.threadId.trim()
  if (!threadId) return
  window.dispatchEvent(new CustomEvent(appServerThreadOpenEvent(input.provider), { detail: { threadId } }))
}

export function appServerThreadScopeKey(provider?: ProviderConfig): string {
  if (!provider) return 'movscript.appServer.threadScope'
  return appServerProviderScopedKey(provider, 'threadScope')
}

export function appServerThreadOpenEvent(provider?: ProviderConfig): string {
  if (!provider) return APP_SERVER_THREAD_OPEN_EVENT
  return `movscript:${appServerProviderKeySegment(provider)}-thread-open`
}

function appServerProviderScopedKey(provider: ProviderConfig, suffix: string): string {
  return `movscript.${appServerProviderKeySegment(provider)}.${suffix}`
}

function appServerProviderKeySegment(provider: ProviderConfig): string {
  return [
    provider.kind,
    provider.id.trim() || provider.kind,
    providerInstanceId(provider),
  ].map(appServerKeySegment).filter(Boolean).join('.')
}

function appServerKeySegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '_')
}
