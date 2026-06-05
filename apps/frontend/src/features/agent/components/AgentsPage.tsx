import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bot, Cable, ListTree, Play, Power, RefreshCw, RotateCw, Save, Settings, Square } from 'lucide-react'
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
  AgentConsoleManagementLink,
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
import { listRuntimeRunSummariesFromWorkspace, listRuntimeThreadSummariesFromWorkspace } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import {
  DEFAULT_AGENT_PROVIDER_SETTINGS,
  enabledAgentProviders,
  normalizeAgentProviderSettings,
  resolveCodexAppServerProfile,
  useAgentProviderConfigStore,
  type AgentProviderConfig,
} from '@/features/agent/state/agentProviderConfigStore'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { localAgentClient, type AgentWorkspaceRuntimeConfig } from '@/shared/infrastructure/localAgentClient'
import { ROUTES } from '@/routes/projectRoutes'
import type { PublicModel } from '@/types'

type AgentTab = 'movscript' | 'codex'
type AgentConfigKey = 'movscript' | 'codex'
type AgentAuthSource = 'model-provider' | 'local-codex-home' | 'managed-codex-home' | 'custom-config' | 'none'

type AgentProviderOption = {
  id: string
  label: string
  source: 'backend' | 'local'
  detail: string
  apiKey?: string
  baseURL?: string
  defaultModel?: string
  apiKind?: string
}

type AgentConfigDraft = {
  providerRef: string
  authSource: AgentAuthSource
  home: string
  workspaceDir: string
}

const MOVSCRIPT_DEFAULT_CONFIG: AgentConfigDraft = {
  providerRef: '',
  authSource: 'model-provider',
  home: '.movscript/agents/movscript',
  workspaceDir: '.',
}

const CODEX_DEFAULT_CONFIG: AgentConfigDraft = {
  providerRef: '',
  authSource: 'local-codex-home',
  home: '.movscript/.codex',
  workspaceDir: '.',
}

export default function AgentsPage() {
  const location = useLocation()
  const tab: AgentTab = location.pathname.includes('/codex') ? 'codex' : 'movscript'
  const savedSettings = useAgentProviderConfigStore((state) => state.settings)
  const setSettings = useAgentProviderConfigStore((state) => state.setSettings)
  const settings = useMemo(() => normalizeAgentProviderSettings(savedSettings), [savedSettings])
  const providers = settings.providers
  const enabledCount = enabledAgentProviders(settings).length
  const workspaceConfigQuery = useQuery({
    queryKey: ['agents-workspace-config'],
    queryFn: () => localAgentClient.getWorkspaceConfig(),
    retry: false,
  })
  const backendModelsQuery = useQuery({
    queryKey: ['agents-backend-models'],
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const providerOptions = useMemo(() => {
    return buildAgentProviderOptions(workspaceConfigQuery.data, backendModelsQuery.data ?? [])
  }, [workspaceConfigQuery.data, backendModelsQuery.data])

  function patchProvider(id: string, patch: Partial<AgentProviderConfig>) {
    setSettings(normalizeAgentProviderSettings({
      ...settings,
      providers: providers.map((provider) => provider.id === id ? { ...provider, ...patch } : provider),
    }))
  }

  function refreshConfig() {
    void Promise.all([workspaceConfigQuery.refetch(), backendModelsQuery.refetch()])
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
              {(workspaceConfigQuery.isLoading || backendModelsQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              管理 MovScript Agent 与 Codex 的启用状态、provider 引用、home、workspaceDir 和运行生命周期；运行中配置会锁定。
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
            <AgentTabButton to={ROUTES.agentsMovscript} active={tab === 'movscript'} icon={<Bot size={14} />}>
              MovScript Agent
            </AgentTabButton>
            <AgentTabButton to={ROUTES.agentsCodex} active={tab === 'codex'} icon={<Cable size={14} />}>
              Codex
            </AgentTabButton>
          </div>

          {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
          {backendModelsQuery.error ? <AgentConsoleInlineError>{errorMessage(backendModelsQuery.error)}</AgentConsoleInlineError> : null}

          {tab === 'movscript' ? (
            <MovScriptAgentPanel
              provider={providers.find((provider) => provider.kind === 'movscript-agent')}
              providerOptions={providerOptions}
              workspaceConfig={workspaceConfigQuery.data}
              onConfigSaved={() => void workspaceConfigQuery.refetch()}
              onPatch={patchProvider}
            />
          ) : (
            <CodexAgentPanel
              provider={providers.find((provider) => provider.kind === 'codex')}
              providerOptions={providerOptions}
              workspaceConfig={workspaceConfigQuery.data}
              onConfigSaved={() => void workspaceConfigQuery.refetch()}
              onPatch={patchProvider}
            />
          )}
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

function MovScriptAgentPanel({
  provider,
  providerOptions,
  workspaceConfig,
  onConfigSaved,
  onPatch,
}: {
  provider?: AgentProviderConfig
  providerOptions: AgentProviderOption[]
  workspaceConfig?: AgentWorkspaceRuntimeConfig
  onConfigSaved: () => void
  onPatch: (id: string, patch: Partial<AgentProviderConfig>) => void
}) {
  const runtimeSessionsQuery = useQuery({
    queryKey: ['agents-movscript-runtime-sessions'],
    queryFn: () => localAgentClient.listRuntimeSessionsFromWorkspace().then((result) => result.sessions),
    retry: false,
  })
  const threadsQuery = useQuery({
    queryKey: ['agents-movscript-threads'],
    queryFn: () => listRuntimeThreadSummariesFromWorkspace({ includeProvisional: true }),
    retry: false,
  })
  const runsQuery = useQuery({
    queryKey: ['agents-movscript-runs'],
    queryFn: () => listRuntimeRunSummariesFromWorkspace(),
    retry: false,
  })
  const resolved = provider ?? DEFAULT_AGENT_PROVIDER_SETTINGS.providers.find((item) => item.kind === 'movscript-agent')!
  const [draft, setDraft] = useState<AgentConfigDraft>(() => agentConfigDraftFromWorkspace(workspaceConfig, 'movscript', MOVSCRIPT_DEFAULT_CONFIG, providerOptions))
  const [ensuring, setEnsuring] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessions = runtimeSessionsQuery.data ?? []
  const runningCount = sessions.filter((session) => session.running && !session.stale).length
  const configLocked = runningCount > 0
  const runCount = runsQuery.data?.length ?? 0
  const threadCount = threadsQuery.data?.length ?? 0
  const loading = runtimeSessionsQuery.isLoading || threadsQuery.isLoading || runsQuery.isLoading

  useEffect(() => {
    if (!workspaceConfig) return
    setDraft(agentConfigDraftFromWorkspace(workspaceConfig, 'movscript', MOVSCRIPT_DEFAULT_CONFIG, providerOptions))
  }, [workspaceConfig, providerOptions])

  async function ensureRuntime() {
    if (!window.api?.ensureAgentRuntime) {
      setError('当前运行环境不支持启动 MovScript Agent runtime。')
      return
    }
    setEnsuring(true)
    setError(null)
    try {
      await window.api.ensureAgentRuntime({ source: 'agents-page' })
      await refreshRuntime()
    } catch (runtimeError) {
      setError(errorMessage(runtimeError))
    } finally {
      setEnsuring(false)
    }
  }

  async function stopRuntime() {
    if (!window.api?.stopAgentRuntime) {
      setError('当前运行环境不支持停止 MovScript Agent runtime。')
      return
    }
    setStopping(true)
    setError(null)
    try {
      await window.api.stopAgentRuntime()
      await refreshRuntime()
    } catch (runtimeError) {
      setError(errorMessage(runtimeError))
    } finally {
      setStopping(false)
    }
  }

  async function restartRuntime() {
    if (!window.api?.ensureAgentRuntime || !window.api?.stopAgentRuntime) {
      setError('当前运行环境不支持重启 MovScript Agent runtime。')
      return
    }
    setRestarting(true)
    setError(null)
    try {
      await window.api.stopAgentRuntime()
      await window.api.ensureAgentRuntime({ source: 'agents-page-restart' })
      await refreshRuntime()
    } catch (runtimeError) {
      setError(errorMessage(runtimeError))
    } finally {
      setRestarting(false)
    }
  }

  async function refreshRuntime() {
    await Promise.all([runtimeSessionsQuery.refetch(), threadsQuery.refetch(), runsQuery.refetch()])
  }

  async function saveConfig() {
    if (configLocked || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveAgentConfig('movscript', buildMovScriptAgentRecord(draft, resolved.enabled), workspaceConfig)
      onConfigSaved()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentConsolePanel
      title="MovScript Agent"
      icon={<Bot size={14} />}
      action={(
        <AgentConsolePanelActions>
          {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={resolved.enabled ? 'success' : 'neutral'} emphasis="soft">
            {resolved.enabled ? '启用' : '停用'}
          </AgentConsoleStatusBadge>
          <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void refreshRuntime()}>
            <RefreshCw size={14} />
            刷新状态
          </AgentConsoleActionButton>
        </AgentConsolePanelActions>
      )}
    >
      <div className="space-y-4">
        {configLocked ? (
          <AgentConsoleCallout compact tone="warning">
            MovScript Agent 运行中：停止 runtime 后才能修改 provider、home 和 workspaceDir。
          </AgentConsoleCallout>
        ) : null}
        {providerOptions.length === 0 ? (
          <AgentConsoleCallout compact tone="warning">
            当前没有可选 Model Provider。请先在 Model Providers 中配置后端模型或本地 provider。
          </AgentConsoleCallout>
        ) : null}

        <AgentConsoleLocalToolCard>
          <AgentConsoleLocalToolHeader>
            <AgentConsoleLocalToolCopy>
              <AgentConsoleLocalToolTitle>{resolved.label}</AgentConsoleLocalToolTitle>
              <AgentConsoleLocalToolDetail>自研 workspace runtime / session registry / run trace</AgentConsoleLocalToolDetail>
            </AgentConsoleLocalToolCopy>
            <AgentConsoleLocalToolControls>
              <AgentConsoleStatusBadge intent={runningCount > 0 ? 'success' : 'warning'} emphasis="soft">
                {runningCount}/{sessions.length} 在线
              </AgentConsoleStatusBadge>
              <input
                type="checkbox"
                checked={resolved.enabled}
                disabled={configLocked}
                onChange={(event) => onPatch(resolved.id, { enabled: event.target.checked })}
                aria-label="MovScript Agent enabled"
              />
            </AgentConsoleLocalToolControls>
          </AgentConsoleLocalToolHeader>
          <AgentConsoleLocalToolFields disabled={!resolved.enabled || configLocked}>
            <AgentConsoleFormField label="显示名称" value={resolved.label} disabled={configLocked} onChange={(event) => onPatch(resolved.id, { label: event.target.value })} />
            <ProviderSelect value={draft.providerRef} options={providerOptions} disabled={!resolved.enabled || configLocked} onChange={(providerRef) => setDraft((current) => ({ ...current, providerRef }))} />
            <AgentConsoleFormField label="Codex home path" value={draft.home} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, home: event.target.value }))} />
            <AgentConsoleFormField label="Workspace Dir" value={draft.workspaceDir} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, workspaceDir: event.target.value }))} />
            <AgentConsoleCallout compact>
              当前 workspace：{sessions[0]?.workspaceDir ?? '尚未创建 runtime session'}；{threadCount} 个 thread / {runCount} 个 run。
            </AgentConsoleCallout>
          </AgentConsoleLocalToolFields>
          <AgentConsoleLocalToolActions>
            <AgentConsoleActionButton type="button" size="sm" onClick={() => void saveConfig()} disabled={configLocked || saving}>
              <Save size={14} />
              {saving ? '保存中...' : '保存配置'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void ensureRuntime()} disabled={!resolved.enabled || ensuring}>
              <Play size={14} />
              {runningCount > 0 ? '确认运行' : '启动 Runtime'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void stopRuntime()} disabled={runningCount === 0 || stopping}>
              <Square size={14} />
              停止
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void restartRuntime()} disabled={!resolved.enabled || runningCount === 0 || restarting}>
              <RotateCw size={14} />
              {restarting ? '重启中...' : '重启'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.agentSettings}>
                <Settings size={14} />
                Skills / Tools / Limits
              </Link>
            </AgentConsoleActionButton>
            <AgentConsoleActionButton asChild size="sm" variant="outline">
              <Link to={ROUTES.agentRuns}>
                <ListTree size={14} />
                运行记录
              </Link>
            </AgentConsoleActionButton>
          </AgentConsoleLocalToolActions>
        </AgentConsoleLocalToolCard>

        {(runtimeSessionsQuery.error || threadsQuery.error || runsQuery.error) ? (
          <AgentConsoleInlineError>
            {errorMessage(runtimeSessionsQuery.error ?? threadsQuery.error ?? runsQuery.error)}
          </AgentConsoleInlineError>
        ) : null}
        {error ? <AgentConsoleInlineError>{error}</AgentConsoleInlineError> : null}

        <AgentConsoleDivider>
          <AgentConsoleGrid columns="three">
            <AgentInfoCard title="Runtime Sessions" detail={`${runningCount} online / ${sessions.length} indexed`} />
            <AgentInfoCard title="Threads" detail={`${threadCount} registered conversation refs`} />
            <AgentInfoCard title="Runs" detail={`${runCount} run records with trace support`} />
          </AgentConsoleGrid>
        </AgentConsoleDivider>
      </div>
    </AgentConsolePanel>
  )
}

function CodexAgentPanel({
  provider,
  providerOptions,
  workspaceConfig,
  onConfigSaved,
  onPatch,
}: {
  provider?: AgentProviderConfig
  providerOptions: AgentProviderOption[]
  workspaceConfig?: AgentWorkspaceRuntimeConfig
  onConfigSaved: () => void
  onPatch: (id: string, patch: Partial<AgentProviderConfig>) => void
}) {
  const resolved = provider ?? DEFAULT_AGENT_PROVIDER_SETTINGS.providers.find((item) => item.kind === 'codex')!
  const profile = resolveCodexAppServerProfile(resolved)
  const [draft, setDraft] = useState<AgentConfigDraft>(() => agentConfigDraftFromWorkspace(workspaceConfig, 'codex', CODEX_DEFAULT_CONFIG, providerOptions))
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusQuery = useQuery({
    queryKey: ['agents-codex-app-server-status', profile.id],
    queryFn: async () => {
      const status = await window.api?.getCodexAppServerStatus?.({ profileId: profile.id })
      return status ?? {
        ok: false,
        running: false,
        managed: false,
        profileId: profile.id,
        error: '当前运行环境不支持 Codex app-server 管理。',
      }
    },
    enabled: resolved.enabled,
    retry: false,
  })
  const status = statusQuery.data
  const running = Boolean(status?.ok && status.running)
  const configLocked = running

  useEffect(() => {
    if (!workspaceConfig) return
    setDraft(agentConfigDraftFromWorkspace(workspaceConfig, 'codex', CODEX_DEFAULT_CONFIG, providerOptions))
  }, [workspaceConfig, providerOptions])

  async function ensureCodex() {
    setError(null)
    try {
      await window.api?.ensureCodexAppServer?.({
        profile: {
          ...profile,
          workspaceDir: draft.workspaceDir || profile.workspaceDir,
          codexHome: draft.home || profile.codexHome,
        },
      })
      await statusQuery.refetch()
    } catch (codexError) {
      setError(errorMessage(codexError))
    }
  }

  async function stopCodex() {
    setError(null)
    try {
      await window.api?.stopCodexAppServer?.({ profileId: profile.id })
      await statusQuery.refetch()
    } catch (codexError) {
      setError(errorMessage(codexError))
    }
  }

  async function restartCodex() {
    setRestarting(true)
    setError(null)
    try {
      if (running) await window.api?.stopCodexAppServer?.({ profileId: profile.id })
      await window.api?.ensureCodexAppServer?.({
        profile: {
          ...profile,
          workspaceDir: draft.workspaceDir || profile.workspaceDir,
          codexHome: draft.home || profile.codexHome,
        },
      })
      await statusQuery.refetch()
    } catch (codexError) {
      setError(errorMessage(codexError))
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
      await saveAgentConfig('codex', buildCodexAgentRecord(draft, providerOption, resolved.enabled), workspaceConfig)
      onConfigSaved()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  function patchProfile(patch: Partial<NonNullable<AgentProviderConfig['codexProfile']>>) {
    onPatch(resolved.id, { codexProfile: { ...profile, ...patch } })
  }

  return (
    <AgentConsolePanel
      title="Codex"
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
            Codex 运行中：停止 app-server 后才能修改 provider、auth、home 和 workspaceDir。
          </AgentConsoleCallout>
        ) : null}
        {draft.authSource === 'model-provider' && providerOptions.find((option) => option.id === draft.providerRef)?.source === 'backend' ? (
          <AgentConsoleCallout compact tone="warning">
            Backend Provider 会作为引用保存；当前 Codex 启动链路不能直接读取后端 API Key，如需立即启动请使用本机 ~/.codex/auth.json 或 Local Provider。
          </AgentConsoleCallout>
        ) : null}

        <AgentConsoleLocalToolCard invalid={resolved.enabled && Boolean(status?.error)}>
          <AgentConsoleLocalToolHeader>
            <AgentConsoleLocalToolCopy>
              <AgentConsoleLocalToolTitle>{resolved.label}</AgentConsoleLocalToolTitle>
              <AgentConsoleLocalToolDetail>MovScript 托管 Codex app-server / Codex home={profile.codexHome}</AgentConsoleLocalToolDetail>
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
                aria-label="Codex enabled"
              />
            </AgentConsoleLocalToolControls>
          </AgentConsoleLocalToolHeader>
          <AgentConsoleLocalToolFields disabled={!resolved.enabled || configLocked}>
            <AgentConsoleFormField label="显示名称" value={resolved.label} disabled={configLocked} onChange={(event) => onPatch(resolved.id, { label: event.target.value })} />
            <ProviderSelect value={draft.providerRef} options={providerOptions} disabled={!resolved.enabled || configLocked} onChange={(providerRef) => setDraft((current) => ({ ...current, providerRef }))} />
            <AgentConsoleSelectField label="Auth Source" value={draft.authSource} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, authSource: event.target.value as AgentAuthSource }))}>
              <option value="local-codex-home">复用本机 ~/.codex/auth.json</option>
              <option value="managed-codex-home">复用托管 Codex home auth.json</option>
              <option value="model-provider">使用选中的 Model Provider</option>
              <option value="custom-config">手动维护 config.toml / auth.json</option>
              <option value="none">不配置账号</option>
            </AgentConsoleSelectField>
            <AgentConsoleFormField label="Codex 可执行文件" value={profile.executablePath ?? ''} disabled={configLocked} onChange={(event) => patchProfile({ executablePath: event.target.value })} placeholder="留空时使用 PATH 中的 codex" />
            <AgentConsoleFormField label="Home" value={draft.home} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, home: event.target.value }))} />
            <AgentConsoleFormField label="Workspace Dir" value={draft.workspaceDir} disabled={!resolved.enabled || configLocked} onChange={(event) => setDraft((current) => ({ ...current, workspaceDir: event.target.value }))} />
            <AgentConsoleCallout compact tone={running ? 'success' : status?.error ? 'warning' : 'neutral'}>
              {running ? `运行中：${status?.endpoint ?? '-'}` : status?.error ?? 'Codex app-server 尚未启动。'}
            </AgentConsoleCallout>
            {status?.codexConfig ? (
              <AgentConsoleCallout compact tone={status.codexConfig.accountConfigured ? 'success' : 'warning'}>
                {status.codexConfig.baseURL} / provider={status.codexConfig.accountSource} / account={status.codexConfig.accountConfigured ? 'configured' : 'missing'}
              </AgentConsoleCallout>
            ) : null}
          </AgentConsoleLocalToolFields>
          <AgentConsoleLocalToolActions>
            <AgentConsoleActionButton type="button" size="sm" onClick={() => void saveConfig()} disabled={configLocked || saving}>
              <Save size={14} />
              {saving ? '保存中...' : '保存配置'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void ensureCodex()} disabled={!resolved.enabled || statusQuery.isFetching}>
              <Play size={14} />
              {running ? '重连 / 确认运行' : '启动'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void stopCodex()} disabled={!running || statusQuery.isFetching}>
              <Square size={14} />
              停止
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void restartCodex()} disabled={!resolved.enabled || !running || statusQuery.isFetching || restarting}>
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
            Codex 的 app-server 生命周期由 MovScript 托管；账号和 Base URL 从 workspace 的 Agent 配置投影到托管 Codex home，并在启动时作为 CODEX_HOME 环境变量传入。
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
  options: AgentProviderOption[]
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

function AgentInfoCard({ title, detail }: { title: string; detail: string }) {
  return (
    <AgentConsoleManagementLink icon={<Bot size={14} />} title={title} detail={detail}>
      <span />
    </AgentConsoleManagementLink>
  )
}

function buildAgentProviderOptions(config: AgentWorkspaceRuntimeConfig | undefined, backendModels: PublicModel[]): AgentProviderOption[] {
  const options: AgentProviderOption[] = []
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

function groupBackendProviders(models: PublicModel[]): AgentProviderOption[] {
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

async function saveAgentConfig(key: AgentConfigKey, record: Record<string, unknown>, currentConfig: AgentWorkspaceRuntimeConfig | undefined): Promise<void> {
  const config = currentConfig ?? await localAgentClient.getWorkspaceConfig()
  await localAgentClient.saveWorkspaceConfig({
    agents: {
      ...(isRecord(config.agents) ? config.agents : {}),
      [key]: {
        ...(isRecord(config.agents?.[key]) ? config.agents[key] : {}),
        ...record,
      },
    },
  })
}

function agentConfigDraftFromWorkspace(
  config: AgentWorkspaceRuntimeConfig | undefined,
  key: AgentConfigKey,
  fallback: AgentConfigDraft,
  providerOptions: AgentProviderOption[],
): AgentConfigDraft {
  const record = isRecord(config?.agents?.[key]) ? config.agents[key] : {}
  return {
    providerRef: stringField(record.providerRef) ?? providerOptions[0]?.id ?? fallback.providerRef,
    authSource: key === 'codex' ? codexAuthSourceFromRecord(record) : fallback.authSource,
    home: stringField(record.home) ?? fallback.home,
    workspaceDir: stringField(record.workspaceDir) ?? fallback.workspaceDir,
  }
}

function buildMovScriptAgentRecord(draft: AgentConfigDraft, enabled: boolean): Record<string, unknown> {
  return {
    enabled,
    providerRef: draft.providerRef,
    home: draft.home,
    workspaceDir: draft.workspaceDir,
  }
}

function buildCodexAgentRecord(draft: AgentConfigDraft, provider: AgentProviderOption | undefined, enabled: boolean): Record<string, unknown> {
  const base = {
    enabled,
    providerRef: draft.providerRef,
    authSource: draft.authSource,
    home: draft.home,
    workspaceDir: draft.workspaceDir,
  }
  switch (draft.authSource) {
    case 'local-codex-home':
      return {
        ...base,
        config: { mode: 'localCodex' },
        auth: { mode: 'localCodex' },
      }
    case 'managed-codex-home':
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

function codexAuthSourceFromRecord(record: Record<string, unknown>): AgentAuthSource {
  const explicit = stringField(record.authSource)
  if (explicit === 'model-provider' || explicit === 'local-codex-home' || explicit === 'managed-codex-home' || explicit === 'custom-config' || explicit === 'none') {
    return explicit
  }
  const mode = stringField(recordField(record.config, 'mode')) ?? stringField(recordField(record.auth, 'mode'))
  if (mode === 'localCodex' || mode === 'local-codex-home') return 'local-codex-home'
  if (mode === 'customApiKey' || mode === 'apiKey' || mode === 'backendKey' || mode === 'backend-api-key') return 'model-provider'
  if (mode === 'customConfig' || mode === 'custom-config' || mode === 'manual') return 'custom-config'
  if (mode === 'none') return 'none'
  return 'managed-codex-home'
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
