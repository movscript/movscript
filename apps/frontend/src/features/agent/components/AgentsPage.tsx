import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bot, Cable, Play, Power, RefreshCw, RotateCw, Save, Square } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDivider,
  AgentConsoleFormField,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
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
  AgentConsoleSelectField,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleToolbar,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
  Button,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import {
  providerRouteForKey,
  providerTitle,
  appServerKey,
  providerRouteKey,
  normalizedProviderKey,
} from '@/features/agent/application/providerRoutes'
import {
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  enabledProviders,
  normalizeProviderSettings,
  resolveAppServerProfile,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { ProviderSessionClient, providerSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import {
  distributeAppServerConfig,
  ensureAppServer as ensureAppServerService,
  getAppServerStatus,
  stopAppServer as stopAppServerService,
} from '@/shared/infrastructure/app-server/appServerRpcClient'
import { ROUTES } from '@/routes/projectRoutes'
import type { PublicModel } from '@/types'

type AppServerAuthSource = 'model-provider' | 'local-home' | 'managed-home' | 'custom-config' | 'none'

const PROVIDER_LOCAL_HOME_COMPAT_MODE = ['local', 'Codex'].join('')

type ProviderOption = {
  id: string
  label: string
  source: 'backend' | 'local'
  detail: string
  apiKey?: string
  baseURL?: string
  defaultModel?: string
  apiKind?: string
}

type ProviderConfigDraft = {
  providerRef: string
  authSource: AppServerAuthSource
  home: string
  workspaceDir: string
}

export default function AgentsPage() {
  const location = useLocation()
  const savedSettings = useProviderConfigStore((state) => state.settings)
  const setSettings = useProviderConfigStore((state) => state.setSettings)
  const settings = useMemo(() => normalizeProviderSettings(savedSettings), [savedSettings])
  const providers = settings.providers
  const appServerProviders = useMemo(() => providers.filter(usesAppServerProtocol), [providers])
  const activeProviderKey = activeProviderKeyFromPath(location.pathname, appServerProviders)
    ?? (appServerProviders[0] ? providerRouteKey(appServerProviders[0]) : MOVA_PROVIDER_ID)
  const activeProvider = appServerProviders.find((provider) => providerMatchesRouteKey(provider, activeProviderKey))
  const activeAppServerKey = activeProvider ? appServerKey(activeProvider) : activeProviderKey
  const enabledCount = enabledProviders(settings).length
  const defaultWorkspaceConfigQuery = useQuery({
    queryKey: ['agents-workspace-config', 'default'],
    queryFn: () => providerSessionClient.getWorkspaceConfig(),
    retry: false,
  })
  const activeProfileSessionClient = useMemo(() => new ProviderSessionClient(undefined, { providerProfileKey: activeAppServerKey }), [activeAppServerKey])
  const workspaceConfigQuery = useQuery({
    queryKey: ['agents-workspace-config', activeAppServerKey],
    queryFn: () => activeProfileSessionClient.getWorkspaceConfig(),
    retry: false,
  })
  const backendModelsQuery = useQuery({
    queryKey: ['agents-backend-models'],
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const providerOptions = useMemo(() => {
    return buildProviderOptions(defaultWorkspaceConfigQuery.data, backendModelsQuery.data ?? [])
  }, [defaultWorkspaceConfigQuery.data, backendModelsQuery.data])

  function patchProvider(id: string, patch: Partial<ProviderConfig>) {
    const provider = providers.find((item) => item.id === id)
      ?? DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === id)
    if (!provider) return
    const nextProvider = { ...provider, ...patch }
    const nextProviders = providers.some((item) => item.id === id)
      ? providers.map((item) => item.id === id ? nextProvider : item)
      : [...providers, nextProvider]
    setSettings(normalizeProviderSettings({
      ...settings,
      providers: nextProviders,
    }))
  }

  function refreshConfig() {
    void Promise.all([defaultWorkspaceConfigQuery.refetch(), workspaceConfigQuery.refetch(), backendModelsQuery.refetch()])
  }

  return (
    <AgentPageShell data-testid="agents-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <Bot size={18} />
              <AgentConsoleHeaderTitle>Agents</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={enabledCount > 0 ? 'success' : 'warning'} emphasis="soft">
                {enabledCount} 个启用
              </AgentConsoleStatusBadge>
              {(defaultWorkspaceConfigQuery.isLoading || workspaceConfigQuery.isLoading || backendModelsQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              管理 app-server providers 的启用状态、provider 引用、home、workspaceDir 和运行生命周期；运行中配置会锁定。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={refreshConfig}>
              <RefreshCw size={14} />
              刷新配置
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.modelProviders}>
                <Cable size={14} />
                Model Providers
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {appServerProviders.map((provider) => {
              const key = providerRouteKey(provider)
              return (
                <AgentTabButton key={provider.id} to={providerRoute(key)} active={providerMatchesRouteKey(provider, activeProviderKey)} icon={<Cable size={14} />}>
                  {provider.label}
                </AgentTabButton>
              )
            })}
          </div>

          {defaultWorkspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(defaultWorkspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
          {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
          {backendModelsQuery.error ? <AgentConsoleInlineError>{errorMessage(backendModelsQuery.error)}</AgentConsoleInlineError> : null}

          <AppServerPanel
            providerKey={activeAppServerKey}
            provider={activeProvider}
            providerOptions={providerOptions}
            workspaceConfig={workspaceConfigQuery.data}
            onConfigSaved={() => void workspaceConfigQuery.refetch()}
            providerSessionClient={activeProfileSessionClient}
            onPatch={patchProvider}
          />
        </div>
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function AgentTabButton({ to, active, icon, children }: { to: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant={active ? 'solid' : 'outline'} className="gap-2">
      <NavLink to={to}>
        {icon}
        {children}
      </NavLink>
    </Button>
  )
}

function activeProviderKeyFromPath(pathname: string, providers: ProviderConfig[]): string | undefined {
  const key = pathname.match(/^\/agents\/([^/?#]+)/)?.[1]
  if (!key) return undefined
  const decoded = normalizedProviderKey(safeDecodeURIComponent(key))
  return providers.some((provider) => providerMatchesRouteKey(provider, decoded))
    ? decoded
    : undefined
}

function providerMatchesRouteKey(provider: ProviderConfig, key: string): boolean {
  const decoded = normalizedProviderKey(key)
  return providerRouteKey(provider) === decoded
    || appServerKey(provider) === decoded
    || normalizedProviderKey(provider.kind) === decoded
}

function providerRoute(providerKey: string): string {
  return providerRouteForKey(providerKey)
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function providerDisplayTitle(providerKey: string): string {
  return providerTitle(providerKey)
}

function defaultProviderConfigDraft(providerKey: string): ProviderConfigDraft {
  const key = normalizedProviderKey(providerKey)
  return {
    providerRef: '',
    authSource: 'local-home',
    home: `.movscript/.${key}`,
    workspaceDir: '.',
  }
}

function fallbackAppServerProvider(providerKey: string): ProviderConfig {
  const key = normalizedProviderKey(providerKey)
  const title = providerDisplayTitle(key)
  return {
    id: key,
    kind: key,
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: `MovScript ${title}`,
    enabled: true,
    appServerProfile: {
      id: `${key}-movscript-home`,
      label: `MovScript ${title}`,
      providerKey: key,
      home: `.movscript/.${key}`,
      lifecycle: 'movscript-owned',
    },
  }
}

function AppServerPanel({
  providerKey,
  provider,
  providerOptions,
  workspaceConfig,
  onConfigSaved,
  providerSessionClient,
  onPatch,
}: {
  providerKey: string
  provider?: ProviderConfig
  providerOptions: ProviderOption[]
  workspaceConfig?: MovScriptWorkspaceConfig
  onConfigSaved: () => void
  providerSessionClient: ProviderSessionClient
  onPatch: (id: string, patch: Partial<ProviderConfig>) => void
}) {
  const title = provider?.label || providerDisplayTitle(providerKey)
  const defaultConfig = useMemo(() => defaultProviderConfigDraft(providerKey), [providerKey])
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
    queryKey: ['agents-app-server-status', providerKey, profile.id],
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
      await ensureAppServerService({
        profile: {
          ...profile,
          workspaceDir: draft.workspaceDir || profile.workspaceDir,
          home: draft.home || profile.home,
        },
      })
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
      await ensureAppServerService({
        profile: {
          ...profile,
          workspaceDir: draft.workspaceDir || profile.workspaceDir,
          home: draft.home || profile.home,
        },
      })
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
        profile: {
          ...profile,
          workspaceDir: draft.workspaceDir || profile.workspaceDir,
          home: draft.home || profile.home,
        },
      })
      await statusQuery.refetch()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  function patchProfile(patch: Partial<NonNullable<ProviderConfig['appServerProfile']>>) {
    onPatch(resolved.id, { appServerProfile: { ...profile, ...patch } })
  }

  return (
    <AgentConsolePanel
      title={title}
      icon={<Cable size={14} />}
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
      <div className="space-y-4">
        {configLocked ? (
          <AgentConsoleCallout compact tone="warning">
            {title} 运行中：停止 app-server 后才能修改 provider、auth、home 和 workspaceDir。
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
              <AgentConsoleLocalToolDetail>MovScript 托管 {title} app-server / home={profile.home}</AgentConsoleLocalToolDetail>
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
            <AgentConsoleFormField label="显示名称" value={resolved.label} disabled={configLocked} onChange={(event) => onPatch(resolved.id, { label: event.target.value })} />
            <ProviderSelect value={draft.providerRef} options={providerOptions} disabled={!resolved.enabled || configLocked} onChange={(providerRef) => setDraft((current) => ({ ...current, providerRef }))} />
            <AgentConsoleSelectField label="Auth Source" value={draft.authSource} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, authSource: event.target.value as AppServerAuthSource }))}>
              <option value="local-home">复用本机 app-server 账号文件</option>
              <option value="managed-home">复用托管 home 账号文件</option>
              <option value="model-provider">使用选中的 Model Provider</option>
              <option value="custom-config">手动维护 config.toml / auth.json</option>
              <option value="none">不配置账号</option>
            </AgentConsoleSelectField>
            <AgentConsoleFormField label={`${title} 可执行文件`} value={profile.executablePath ?? ''} disabled={configLocked} onChange={(event) => patchProfile({ executablePath: event.target.value })} placeholder={`留空时使用 PATH 中的 ${providerKey}`} />
            <AgentConsoleFormField label="Home" value={draft.home} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, home: event.target.value }))} />
            <AgentConsoleFormField label="Workspace Dir" value={draft.workspaceDir} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, workspaceDir: event.target.value }))} />
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
          <AgentConsoleDescription>
            {title} 的 app-server 生命周期由 MovScript 托管；账号和 Base URL 从 workspace 的 provider 配置投影到托管 home，并在启动时传给 app-server 进程。
          </AgentConsoleDescription>
          <AgentConsoleToolbar>
            <AgentConsoleStatusBadge intent="neutral" emphasis="soft">profile={profile.id}</AgentConsoleStatusBadge>
            <AgentConsoleStatusBadge intent="neutral" emphasis="soft">lifecycle={profile.lifecycle}</AgentConsoleStatusBadge>
          </AgentConsoleToolbar>
        </AgentConsoleDivider>
      </div>
    </AgentConsolePanel>
  )
}

function ProviderSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string
  options: ProviderOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <AgentConsoleSelectField label="Provider" value={value} disabled={disabled || options.length === 0} onChange={(event) => onChange(event.target.value)}>
      {options.length === 0 ? <option value="">未配置 provider</option> : null}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label} - {option.detail}
        </option>
      ))}
    </AgentConsoleSelectField>
  )
}

function buildProviderOptions(config: MovScriptWorkspaceConfig | undefined, backendModels: PublicModel[]): ProviderOption[] {
  const options: ProviderOption[] = []
  for (const provider of groupBackendProviders(backendModels)) options.push(provider)
  const localProviders = Array.isArray(config?.modelProviders) ? config.modelProviders : []
  for (const record of localProviders) {
    const id = stringField(record.id)
    if (!id || record.enabled === false) continue
    const baseURL = stringField(record.baseURL)
    const defaultModel = stringField(record.defaultModel)
    const apiKind = stringField(record.apiKind)
    options.push({
      id: `local:${id}`,
      label: stringField(record.label) ?? id,
      source: 'local',
      detail: `${apiKind ?? 'api'} / ${baseURL ?? '未设置 Base URL'}`,
      ...(stringField(record.apiKey) ? { apiKey: stringField(record.apiKey) } : {}),
      ...(baseURL ? { baseURL } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      ...(apiKind ? { apiKind } : {}),
    })
  }
  return options
}

function groupBackendProviders(models: PublicModel[]): ProviderOption[] {
  const groups = new Map<string, { label: string; models: PublicModel[]; capabilities: Set<string> }>()
  for (const model of models) {
    const key = `backend:${model.credential_id}`
    const group = groups.get(key) ?? {
      label: model.provider_name?.trim() || 'Backend Provider',
      models: [],
      capabilities: new Set<string>(),
    }
    group.models.push(model)
    for (const capability of model.capabilities ?? []) group.capabilities.add(capability)
    groups.set(key, group)
  }
  return Array.from(groups.entries()).map(([id, group]) => {
    const defaultModel = group.models.find((model) => model.is_default) ?? group.models[0]
    return {
      id,
      label: group.label,
      source: 'backend',
      detail: `${group.models.length} models / ${Array.from(group.capabilities).join(', ') || 'capability pending'}`,
      ...(defaultModel ? { defaultModel: publicModelId(defaultModel) } : {}),
    }
  })
}

async function saveProviderConfig(client: ProviderSessionClient, key: string, record: Record<string, unknown>, currentConfig: MovScriptWorkspaceConfig | undefined): Promise<void> {
  const config = currentConfig ?? await client.getWorkspaceConfig()
  await client.saveWorkspaceConfig({
    providers: {
      ...(isRecord(config.providers) ? config.providers : {}),
      [key]: {
        ...(isRecord(config.providers?.[key]) ? config.providers[key] : {}),
        ...record,
      },
    },
  })
}

function providerConfigDraftFromWorkspaceConfig(
  config: MovScriptWorkspaceConfig | undefined,
  key: string,
  fallback: ProviderConfigDraft,
  providerOptions: ProviderOption[],
): ProviderConfigDraft {
  const record = isRecord(config?.providers?.[key]) ? config.providers[key] : {}
  return {
    providerRef: stringField(record.providerRef) ?? providerOptions[0]?.id ?? fallback.providerRef,
    authSource: appServerAuthSourceFromRecord(record),
    home: stringField(record.home) ?? fallback.home,
    workspaceDir: stringField(record.workspaceDir) ?? fallback.workspaceDir,
  }
}

function buildAppServerRecord(draft: ProviderConfigDraft, provider: ProviderOption | undefined, enabled: boolean, profile?: ProviderConfig['appServerProfile']): Record<string, unknown> {
  const base = {
    enabled,
    providerRef: draft.providerRef,
    authSource: draft.authSource,
    home: draft.home,
    workspaceDir: draft.workspaceDir,
    ...(profile?.compatibilityHomeEnvNames?.length ? { appServer: { compatibilityHomeEnvNames: profile.compatibilityHomeEnvNames } } : {}),
  }
  switch (draft.authSource) {
    case 'local-home':
      return {
        ...base,
        config: { mode: 'local-home' },
        auth: { mode: 'local-home' },
      }
    case 'managed-home':
      return {
        ...base,
        config: { mode: 'auto' },
        auth: { mode: 'auto' },
      }
    case 'model-provider':
      if (provider?.source === 'local' && provider.apiKey) {
        return {
          ...base,
          config: { mode: 'customApiKey' },
          auth: {
            mode: 'apiKey',
            apiKey: provider.apiKey,
            ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
          },
        }
      }
      return {
        ...base,
        baseURL: resolveBackendProviderBaseURL(),
        config: { mode: 'backendKey', modelProviderRef: draft.providerRef },
        auth: { mode: 'backendKey', modelProviderRef: draft.providerRef },
      }
    case 'custom-config':
      return {
        ...base,
        config: { mode: 'customConfig' },
        auth: { mode: 'customConfig' },
      }
    case 'none':
      return {
        ...base,
        config: { mode: 'none' },
        auth: { mode: 'none' },
      }
  }
}

function resolveBackendProviderBaseURL(): string {
  return `${getAPIBaseURL()}/v1`
}

function appServerAuthSourceFromRecord(record: Record<string, unknown>): AppServerAuthSource {
  const explicit = stringField(record.authSource)
  if (explicit === 'model-provider' || explicit === 'local-home' || explicit === 'managed-home' || explicit === 'custom-config' || explicit === 'none') {
    return explicit
  }
  const mode = stringField(recordField(record, 'config')?.mode) ?? stringField(recordField(record, 'auth')?.mode)
  if (mode === PROVIDER_LOCAL_HOME_COMPAT_MODE || mode === 'local-home') return 'local-home'
  if (mode === 'customApiKey' || mode === 'apiKey' || mode === 'backendKey' || mode === 'backend-api-key') return 'model-provider'
  if (mode === 'customConfig' || mode === 'custom-config' || mode === 'manual') return 'custom-config'
  if (mode === 'none') return 'none'
  return 'managed-home'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return isRecord(value[key]) ? value[key] : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
