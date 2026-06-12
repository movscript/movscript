import { useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AgentChatDataSourceShell,
  type AgentChatDataSourceShellLoadResult,
} from '@/features/agent/components/AgentChatDataSourceShell'
import {
  openAgentChatDataSourceThread,
  readStoredActiveThreadId,
} from '@/features/agent/presentation/agentActiveThreadStorage'
import { createAppServerChatDataSource } from '@/shared/infrastructure/app-server/appServerChatDataSource'
import {
  appServerRpcClientForURL,
  ensureAppServer,
  ensureAppServerRpcClient,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { AGENT_BACKEND_MODEL_CAPABILITY_QUERY, fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import { useAgentStore } from '@/features/agent/state/agentStore'
import {
  providerInstanceId,
  resolveAppServerProfile,
  MOVA_PROVIDER_ID,
  type ProviderConfig,
  type MovScriptWorkspaceContext,
} from '@/shared/infrastructure/providerConfigStore'
import type { AgentPanelNewConversationPayload } from '@/features/agent/application/agentPanelBridge'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { publicModelId } from '@/shared/domain/modelDisplay'

export const ACTIVE_APP_SERVER_THREAD_STORAGE_KEY = 'movscript.appServer.activeThreadId'
export const APP_SERVER_THREAD_OPEN_EVENT = 'movscript:app-server-thread-open'

export interface AppServerChatShellProps {
  userId: string
  provider?: ProviderConfig
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showCollapse?: boolean
  onCollapse?: () => void
}

export function AppServerChatShell({
  surface = 'panel',
  ...props
}: AppServerChatShellProps) {
  const project = useProjectStore((state) => state.current)

  if (surface === 'page') {
    return <RouteAwareAppServerChatShell {...props} surface={surface} projectId={project?.ID} />
  }

  return (
    <AppServerChatShellContent
      {...props}
      surface={surface}
      routeWorkspaceContext={appServerProjectWorkspaceContext(project?.ID)}
    />
  )
}

function RouteAwareAppServerChatShell({
  projectId,
  ...props
}: AppServerChatShellProps & {
  projectId?: number
}) {
  const location = useLocation()
  const routeWorkspaceContext = useMemo(() => appServerWorkspaceContextFromRoute({
    projectId,
    pathname: location.pathname,
    search: location.search,
  }), [location.pathname, location.search, projectId])

  return <AppServerChatShellContent {...props} routeWorkspaceContext={routeWorkspaceContext} />
}

function AppServerChatShellContent({
  userId,
  provider,
  host,
  surface = 'panel',
  showCollapse,
  onCollapse,
  routeWorkspaceContext,
}: AppServerChatShellProps & {
  routeWorkspaceContext: MovScriptWorkspaceContext
}) {
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
    if (provider && routeWorkspaceContext) return loadScopedAppServerDataSource({
      provider,
      providerLabel,
      resolveModelForRequest,
      workspaceContext: routeWorkspaceContext,
    })
    const client = await ensureAppServerRpcClient(provider)
    return appServerDataSourceLoadResult({
      clientURL: client?.url,
      provider,
      providerLabel,
      resolveModelForRequest,
    })
  }, [provider, providerLabel, resolveModelForRequest, routeWorkspaceContext, textModels])
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

  const activeThreadStorageKey = appServerActiveThreadStorageKey(provider)
  const openThreadEventName = appServerThreadOpenEvent(provider)
  const readActiveThreadId = useCallback(() => readAppServerActiveThreadId(provider), [provider])

  return (
    <AgentChatDataSourceShell
      userId={userId}
      loadDataSource={loadDataSource}
      loadDataSourceForNewThread={loadDataSourceForNewThread}
      activeThreadStorageKey={activeThreadStorageKey}
      readActiveThreadId={readActiveThreadId}
      openThreadEventName={openThreadEventName}
      providerLabel={providerLabel}
      threadListLabel={`${providerLabel} Threads`}
      emptyThreadListLabel={`No ${providerLabel} threads yet.`}
      unavailableLabel={`${providerLabel} app-server URL is not configured.`}
      composerPlaceholder="随心输入"
      newThreadLabel={`New ${providerLabel} thread`}
      modelOptions={textModels}
      selectedModelId={settings.modelId}
      onSelectedModelChange={(modelId) => updateSettings({ modelId })}
      collaborationMode={settings.collaborationMode}
      goalModeEnabled={settings.goalModeEnabled}
      onCollaborationModeChange={(collaborationMode) => updateSettings({ collaborationMode })}
      onGoalModeEnabledChange={(goalModeEnabled) => updateSettings({ goalModeEnabled })}
      host={host}
      surface={surface}
      showThreadList={surface !== 'page'}
      autoLoadThreads={surface !== 'page'}
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

function appServerProjectWorkspaceContext(projectId?: number): MovScriptWorkspaceContext {
  if (!projectId) return { scope: 'global' }
  return {
    scope: 'project',
    projectId,
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
  openAgentChatDataSourceThread({
    storageKey: appServerActiveThreadStorageKey(input.provider),
    eventName: appServerThreadOpenEvent(input.provider),
    threadId: input.threadId,
  })
}

export function appServerActiveThreadStorageKey(provider?: ProviderConfig): string {
  if (!provider) return ACTIVE_APP_SERVER_THREAD_STORAGE_KEY
  return appServerProviderScopedKey(provider, 'activeThreadId')
}

export function appServerThreadOpenEvent(provider?: ProviderConfig): string {
  if (!provider) return APP_SERVER_THREAD_OPEN_EVENT
  return `movscript:${appServerProviderKeySegment(provider)}-thread-open`
}

export function readAppServerActiveThreadId(provider?: ProviderConfig): string | null {
  const current = readStoredActiveThreadId(appServerActiveThreadStorageKey(provider))
  if (current) return current
  const compat = readStoredActiveThreadId(appServerActiveThreadCompatStorageKey(provider))
  if (compat) return compat
  if (provider) return readStoredActiveThreadId(ACTIVE_APP_SERVER_THREAD_STORAGE_KEY)
  return null
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

function appServerActiveThreadCompatStorageKey(provider?: ProviderConfig): string {
  if (!provider) return ACTIVE_APP_SERVER_THREAD_STORAGE_KEY
  const providerId = provider.id.trim() || provider.kind
  return `movscript.${provider.kind}.${providerId}.activeThreadId`
}
