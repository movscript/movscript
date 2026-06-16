import {
  useEffect,
  useMemo,
  useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play,
  Power,
  RefreshCw,
  RotateCw,
  Save,
  Square } from 'lucide-react'

import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDivider,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolActions,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSavedText,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import { IdentityBadge, IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import { ensureDefaultAgentProviderFromBackend } from '@/features/agent/application/defaultAgentProvider'
import {
  buildAppServerRecord,
  defaultProviderConfigDraft,
  fallbackAppServerProvider,
  providerConfigDraftFromWorkspaceConfig,
  providerDisplayTitle,
  ProviderSelect,
  providerSelectionValue,
  saveProviderConfig,
  type ProviderConfigDraft,
  type ProviderOption,
} from '@/features/agent/components/AgentsPageAppServerPanelModel'
import {
  appServerKey,
  normalizedProviderKey,
} from '@/features/agent/application/providerRoutes'
import {
  DEFAULT_PROVIDER_SETTINGS,
  resolveAppServerProfile,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import {
  ProviderSessionClient,
  type MovScriptWorkspaceConfig,
} from '@/shared/infrastructure/providerSessionClient'
import {
  distributeAppServerConfig,
  ensureAppServer as ensureAppServerService,
  getAppServerStatus,
  stopAppServer as stopAppServerService,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { ROUTES } from '@/routes/projectRoutes'
import type { PublicModel } from '@/types'

export {
  activeProviderKeyFromPath,
  buildProviderOptions,
  providerMatchesRouteKey,
  providerRoute,
} from '@/features/agent/components/AgentsPageAppServerPanelModel'

export function AppServerPanel({
  providerKey,
  provider,
  providerOptions,
  backendModels,
  workspaceConfig,
  onConfigSaved,
  providerSessionClient,
  onPatch,
}: {
  providerKey: string
  provider?: ProviderConfig
  providerOptions: ProviderOption[]
  backendModels: PublicModel[]
  workspaceConfig?: MovScriptWorkspaceConfig
  onConfigSaved: () => void
  providerSessionClient: ProviderSessionClient
  onPatch: (id: string, patch: Partial<ProviderConfig>) => void
}) {
  const title = provider?.label || providerDisplayTitle(providerKey)
  const defaultConfig = useMemo(() => defaultProviderConfigDraft(), [])
  const resolved = provider
    ?? DEFAULT_PROVIDER_SETTINGS.providers.find((item) => appServerKey(item) === normalizedProviderKey(providerKey) || item.kind === normalizedProviderKey(providerKey))
    ?? fallbackAppServerProvider(providerKey)
  const profile = resolveAppServerProfile(resolved)
  const [draft, setDraft] = useState<ProviderConfigDraft>(() => providerConfigDraftFromWorkspaceConfig(workspaceConfig, providerKey, defaultConfig, providerOptions))
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusQuery = useQuery({
    queryKey: agentProviderKeys.appServerStatus(providerKey, profile.id),
    queryFn: async () => {
      const status = await getAppServerStatus({ profileId: profile.id })
      return status ?? {
        ok: false,
        running: false,
        managed: false,
        profileId: profile.id,
        error: `当前运行环境不支持 ${title} app-server 管理。`,
      }
    },
    enabled: resolved.enabled,
    retry: false,
  })
  const status = statusQuery.data
  const running = Boolean(status?.ok && status.running)
  const statusConfig = status?.config
  const configLocked = running

  useEffect(() => {
    if (!workspaceConfig) return
    setDraft(providerConfigDraftFromWorkspaceConfig(workspaceConfig, providerKey, defaultConfig, providerOptions))
  }, [providerKey, defaultConfig, workspaceConfig, providerOptions])

  async function ensureAppServer() {
    setError(null)
    try {
      await ensureDefaultAgentProviderFromBackend({ provider: resolved, client: providerSessionClient, ...(backendModels.length > 0 ? { models: backendModels } : {}) })
      const status = await ensureAppServerService({
        profile,
      })
      if (!status?.ok) throw new Error(status?.error || `${title} app-server 启动失败。`)
      await statusQuery.refetch()
    } catch (appServerError) {
      setError(errorMessage(appServerError))
    }
  }

  async function stopAppServer() {
    setError(null)
    try {
      await stopAppServerService({ profileId: profile.id })
      await statusQuery.refetch()
    } catch (appServerError) {
      setError(errorMessage(appServerError))
    }
  }

  async function restartAppServer() {
    setRestarting(true)
    setError(null)
    try {
      if (running) await stopAppServerService({ profileId: profile.id })
      await ensureDefaultAgentProviderFromBackend({ provider: resolved, client: providerSessionClient, ...(backendModels.length > 0 ? { models: backendModels } : {}) })
      const status = await ensureAppServerService({
        profile,
      })
      if (!status?.ok) throw new Error(status?.error || `${title} app-server 重启失败。`)
      await statusQuery.refetch()
    } catch (appServerError) {
      setError(errorMessage(appServerError))
    } finally {
      setRestarting(false)
    }
  }

  async function saveConfig() {
    if (configLocked || saving) return
    setSaving(true)
    setError(null)
    try {
      const providerOption = providerOptions.find((option) => option.id === draft.providerRef)
      await saveProviderConfig(providerSessionClient, providerKey, buildAppServerRecord(draft, providerOption, resolved.enabled, resolved.appServerProfile), workspaceConfig)
      onConfigSaved()
      await distributeAppServerConfig({
        profile,
      })
      await statusQuery.refetch()
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentConsolePanel
      title={title}
      icon={<IdentityMark kind="agent" id={providerKey} />}
      action={(
        <AgentConsolePanelActions>
          {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
          {statusQuery.isFetching && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={running ? 'success' : resolved.enabled ? 'warning' : 'neutral'} emphasis="soft">
            {running ? '运行中' : resolved.enabled ? '未启动' : '停用'}
          </AgentConsoleStatusBadge>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}>
            <RefreshCw size={14} />
            刷新状态
          </AgentConsoleActionButton>
        </AgentConsolePanelActions>
      )}
    >
      <AgentConsoleStack spacing="loose">
        {configLocked ? (
          <AgentConsoleCallout compact tone="warning">
            {title} 运行中：停止 app-server 后才能修改 provider 和账号来源。
          </AgentConsoleCallout>
        ) : null}
        {draft.authSource === 'model-provider' && providerOptions.find((option) => option.id === draft.providerRef)?.source === 'backend' ? (
          <AgentConsoleCallout compact tone="warning">
            Backend Provider 会作为引用保存；当前 {title} 启动链路不能直接读取后端 API Key，如需立即启动请使用本机 app-server 账号文件或 Local Provider。
          </AgentConsoleCallout>
        ) : null}

        <AgentConsoleLocalToolCard invalid={resolved.enabled && Boolean(status?.error)}>
          <AgentConsoleLocalToolHeader>
            <AgentConsoleLocalToolCopy>
              <AgentConsoleLocalToolTitle>{resolved.label}</AgentConsoleLocalToolTitle>
              <AgentConsoleLocalToolDetail>
                <IdentityBadge kind="agent" id={providerKey} label={title} size="xs" /> app-server
              </AgentConsoleLocalToolDetail>
            </AgentConsoleLocalToolCopy>
            <AgentConsoleLocalToolControls>
              <AgentConsoleStatusBadge intent={resolved.enabled ? 'success' : 'neutral'} emphasis="soft">
                {resolved.enabled ? '启用' : '停用'}
              </AgentConsoleStatusBadge>
              <input
                type="checkbox"
                checked={resolved.enabled}
                disabled={configLocked}
                onChange={(event) => onPatch(resolved.id, { enabled: event.target.checked })}
                aria-label={`${title} enabled`}
              />
            </AgentConsoleLocalToolControls>
          </AgentConsoleLocalToolHeader>
          <AgentConsoleLocalToolFields disabled={!resolved.enabled || configLocked}>
            <ProviderSelect value={providerSelectionValue(draft)} options={providerOptions} disabled={!resolved.enabled || configLocked} onChange={(nextDraft) => setDraft((current) => ({ ...current, ...nextDraft }))} />
            <AgentConsoleCallout compact tone={running ? 'success' : status?.error ? 'warning' : 'neutral'}>
              {running ? `运行中：${status?.endpoint ?? '-'}` : status?.error ?? `${title} app-server 尚未启动。`}
            </AgentConsoleCallout>
            {statusConfig ? (
              <AgentConsoleCallout compact tone={statusConfig.accountConfigured ? 'success' : 'warning'}>
                {statusConfig.baseURL} / provider={statusConfig.accountSource} / account={statusConfig.accountConfigured ? 'configured' : 'missing'}
              </AgentConsoleCallout>
            ) : null}
          </AgentConsoleLocalToolFields>
          <AgentConsoleLocalToolActions>
            <AgentConsoleActionButton type="button" size="sm" onClick={() => void saveConfig()} disabled={configLocked || saving}>
              <Save size={14} />
              {saving ? '保存中...' : '保存配置'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void ensureAppServer()} disabled={!resolved.enabled || statusQuery.isFetching}>
              <Play size={14} />
              {running ? '重连 / 确认运行' : '启动'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void stopAppServer()} disabled={!running || statusQuery.isFetching}>
              <Square size={14} />
              停止
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void restartAppServer()} disabled={!resolved.enabled || !running || statusQuery.isFetching || restarting}>
              <RotateCw size={14} />
              {restarting ? '重启中...' : '重启'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.modelProviders}>
                <Power size={14} />
                Model Providers
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleLocalToolActions>
        </AgentConsoleLocalToolCard>

        {error ? <AgentConsoleInlineError>{error}</AgentConsoleInlineError> : null}

        <AgentConsoleDivider>
          <AgentConsoleIntroRow>
            <AgentConsoleDescription>
              {title} 的 app-server 生命周期由 MovScript 托管；账号和 Base URL 从 workspace 的 provider 配置投影到托管 home，并在启动时传给 app-server 进程。
            </AgentConsoleDescription>
            <AgentConsoleToolbar>
              <AgentConsoleStatusBadge intent="neutral" emphasis="soft">profile={profile.id}</AgentConsoleStatusBadge>
              <AgentConsoleStatusBadge intent="neutral" emphasis="soft">lifecycle={profile.lifecycle}</AgentConsoleStatusBadge>
            </AgentConsoleToolbar>
          </AgentConsoleIntroRow>
        </AgentConsoleDivider>
      </AgentConsoleStack>
    </AgentConsolePanel>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
