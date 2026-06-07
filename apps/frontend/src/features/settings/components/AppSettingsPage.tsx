import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, Clapperboard, HardDrive, Image, LayoutDashboard, RefreshCw, Server, Settings } from 'lucide-react'
import {
  AppSettingsActionButton,
  AppSettingsActionRow,
  AppSettingsAdminSurface,
  AppSettingsBackButton,
  AppSettingsChoiceGrid,
  AppSettingsChoiceTile,
  AppSettingsContentStack,
  AppSettingsEndpointSurface,
  AppSettingsFeedbackText,
  AppSettingsField,
  AppSettingsFooterText,
  AppSettingsHeader,
  AppSettingsInput,
  AppSettingsIntro,
  AppSettingsMain,
  AppSettingsSection,
  AppSettingsShell,
  Textarea,
} from '@movscript/ui'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL, type AppSettings } from '@/shared/infrastructure/config'
import { adminConsoleURL, openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import { routeForWorkMode } from '@/routes/appRouteModel'
import type { ExternalResourceSource } from '@/types'

type TestState =
  | { status: 'idle'; message: string }
  | { status: 'testing'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type ExternalResourceProviderKey = 'pexels' | 'pixabay'

const EXTERNAL_RESOURCE_PROVIDERS: Array<{
  key: ExternalResourceProviderKey
  name: string
  fieldId: string
  keyLabel: string
  keyPlaceholder: string
}> = [
  {
    key: 'pexels',
    name: 'Pexels',
    fieldId: 'externalResourcePexelsApiKey',
    keyLabel: 'Pexels API Key',
    keyPlaceholder: '输入 Pexels API Key',
  },
  {
    key: 'pixabay',
    name: 'Pixabay',
    fieldId: 'externalResourcePixabayApiKey',
    keyLabel: 'Pixabay API Key',
    keyPlaceholder: '输入 Pixabay API Key',
  },
]

const EMPTY_EXTERNAL_RESOURCE_SOURCES: ExternalResourceSource[] = []

interface ResourceBlobGCResult {
  backend: string
  dry_run: boolean
  candidates: number
  deleted: number
  freed_bytes: number
}

function healthURL(baseURL: string): string {
  return `${normalizeAPIBaseURL(baseURL)}/health`
}

export function AppSettingsPanel({ host = 'page' }: { host?: 'page' | 'dialog' } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const settings = useAppSettingsStore((s) => s.settings)
  const setLaunchMode = useAppSettingsStore((s) => s.setLaunchMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const setAPIBaseURL = useAppSettingsStore((s) => s.setAPIBaseURL)
  const setMovScriptWorkspaceDir = useAppSettingsStore((s) => s.setMovScriptWorkspaceDir)
  const setShotLibrarySources = useAppSettingsStore((s) => s.setShotLibrarySources)
  const resetSettings = useAppSettingsStore((s) => s.reset)
  const [apiBaseURL, setAPIBaseURLInput] = useState(settings.apiBaseURL)
  const [workspaceDir, setWorkspaceDirInput] = useState(settings.movScriptWorkspaceDir ?? '')
  const [shotSourcesText, setShotSourcesText] = useState(formatShotLibrarySources(settings))
  const [saved, setSaved] = useState(false)
  const [workspaceSaved, setWorkspaceSaved] = useState(false)
  const [shotSourcesSaved, setShotSourcesSaved] = useState(false)
  const [testState, setTestState] = useState<TestState>({ status: 'idle', message: '' })
  const [resourceGCState, setResourceGCState] = useState<TestState>({ status: 'idle', message: '' })

  const normalized = useMemo(() => {
    try {
      return normalizeAPIBaseURL(apiBaseURL)
    } catch {
      return apiBaseURL.trim()
    }
  }, [apiBaseURL])
  const hasChanged = normalized !== settings.apiBaseURL
  const workspaceDirChanged = workspaceDir.trim() !== (settings.movScriptWorkspaceDir ?? '')
  const isValid = /^https?:\/\/.+/i.test(normalized)
  const parsedShotSources = useMemo(() => parseShotLibrarySources(shotSourcesText), [shotSourcesText])
  const shotSourcesValid = parsedShotSources.ok
  const shotSourcesChanged = shotSourcesText.trim() !== formatShotLibrarySources(settings).trim()
  const localMode = isLocalLaunchMode(settings)
  const adminURL = isValid ? adminConsoleURL(normalized) : ''

  function chooseLaunchMode(mode: AppSettings['launchMode']) {
    const currentLocalURL = getLocalAPIBaseURL()
    setLaunchMode(mode)
    setSaved(false)
    if (mode === 'local') {
      setAPIBaseURLInput(currentLocalURL)
    } else if (normalizeAPIBaseURL(apiBaseURL) === currentLocalURL) {
      setAPIBaseURLInput(getDefaultAPIBaseURL())
    }
  }

  function chooseWorkMode(mode: AppSettings['workMode']) {
    setWorkMode(mode)
    if (!user) return
    navigate(routeForWorkMode(mode, !!currentProject))
  }

  function saveSettings() {
    if (!isValid) return
    setAPIBaseURL(normalized)
    setSaved(true)
    setTestState({ status: 'idle', message: '' })
    setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  function saveWorkspaceRoot() {
    setMovScriptWorkspaceDir(workspaceDir)
    setWorkspaceSaved(true)
  }

  function saveShotLibrarySources() {
    if (!parsedShotSources.ok) return
    setShotLibrarySources(parsedShotSources.sources, parsedShotSources.defaultSourceId)
    setShotSourcesSaved(true)
  }

  function resetToDefault() {
    resetSettings()
    setAPIBaseURLInput(getDefaultAPIBaseURL())
    setWorkspaceDirInput('')
    setSaved(true)
    setWorkspaceSaved(false)
    setTestState({ status: 'idle', message: '' })
    setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  async function testConnection() {
    if (!isValid) return
    setTestState({ status: 'testing', message: t('appSettings.testing') })
    try {
      const res = await fetch(healthURL(normalized))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTestState({ status: 'success', message: t('appSettings.testSuccess') })
    } catch (error) {
      setTestState({
        status: 'error',
        message: error instanceof Error ? t('appSettings.testFailedWithReason', { reason: error.message }) : t('appSettings.testFailed'),
      })
    }
  }

  async function collectResourceBlobs(dryRun: boolean) {
    setResourceGCState({ status: 'testing', message: dryRun ? t('appSettings.resourceBlobGCDryRunning') : t('appSettings.resourceBlobGCRunning') })
    try {
      const params = new URLSearchParams({ limit: '100', dry_run: dryRun ? 'true' : 'false' })
      const result = await api.post<ResourceBlobGCResult>(`/admin/resource-storage/blobs/gc?${params}`).then(response => response.data)
      const message = dryRun
        ? t('appSettings.resourceBlobGCDryRunResult', {
            count: result.candidates,
            bytes: formatBytes(result.freed_bytes),
            backend: result.backend || '-',
          })
        : t('appSettings.resourceBlobGCResult', {
            count: result.deleted,
            bytes: formatBytes(result.freed_bytes),
            backend: result.backend || '-',
          })
      setResourceGCState({ status: 'success', message })
      if (!dryRun) toast.success(message)
    } catch (error) {
      setResourceGCState({
        status: 'error',
        message: error instanceof Error ? t('appSettings.resourceBlobGCFailedWithReason', { reason: error.message }) : t('appSettings.resourceBlobGCFailed'),
      })
    }
  }

  const content = (
    <AppSettingsContentStack>
          <AppSettingsIntro title={t('appSettings.title')} description={t('appSettings.description')} />

          <AppSettingsSection
            icon={Settings}
            title={t('appSettings.launchModeTitle')}
            description={t('appSettings.launchModeHint')}
          >
            <AppSettingsChoiceGrid>
              {(['cloud', 'local'] as const).map((mode) => {
                const selected = settings.launchMode === mode
                return (
                  <AppSettingsChoiceTile
                    key={mode}
                    type="button"
                    selected={selected}
                    onClick={() => chooseLaunchMode(mode)}
                    title={mode === 'cloud' ? t('appSettings.cloudMode') : t('appSettings.localMode')}
                    detail={mode === 'cloud' ? t('appSettings.cloudModeHelp') : t('appSettings.localModeHelp')}
                  />
                )
              })}
            </AppSettingsChoiceGrid>
          </AppSettingsSection>

          <AppSettingsSection
            icon={Bot}
            title={t('appSettings.workModeTitle')}
            description={t('appSettings.workModeHint')}
          >
            <AppSettingsChoiceGrid>
              {(['detail', 'agent'] as const).map((mode) => {
                const selected = settings.workMode === mode
                const Icon = mode === 'agent' ? Bot : LayoutDashboard
                return (
                  <AppSettingsChoiceTile
                    key={mode}
                    type="button"
                    selected={selected}
                    onClick={() => chooseWorkMode(mode)}
                    icon={<Icon size={14} />}
                    title={mode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
                    detail={mode === 'agent' ? t('appSettings.agentWorkModeHelp') : t('appSettings.detailWorkModeHelp')}
                  />
                )
              })}
            </AppSettingsChoiceGrid>
          </AppSettingsSection>

          <AppSettingsSection
            icon={HardDrive}
            title={t('appSettings.movScriptWorkspaceTitle')}
            description={t('appSettings.movScriptWorkspaceHint')}
          >
            <AppSettingsField
              label={t('appSettings.movScriptWorkspaceDir')}
              htmlFor="movScriptWorkspaceDir"
              help={t('appSettings.movScriptWorkspaceDirHelp')}
            >
              <AppSettingsInput
                id="movScriptWorkspaceDir"
                value={workspaceDir}
                onChange={(e) => {
                  setWorkspaceDirInput(e.target.value)
                  setWorkspaceSaved(false)
                }}
                placeholder={t('appSettings.movScriptWorkspaceDirPlaceholder')}
                spellCheck={false}
              />
            </AppSettingsField>

            <AppSettingsEndpointSurface
              label={t('appSettings.movScriptWorkspaceEffectiveRoot')}
              value={settings.movScriptWorkspaceDir?.trim() || t('appSettings.movScriptWorkspaceDefaultRoot')}
            />

            {workspaceSaved && (
              <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
                {t('appSettings.saved')}
              </AppSettingsFeedbackText>
            )}

            <AppSettingsActionRow>
              <AppSettingsActionButton onClick={saveWorkspaceRoot} disabled={!workspaceDirChanged}>
                {t('common.save')}
              </AppSettingsActionButton>
              <AppSettingsActionButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setWorkspaceDirInput('')
                  setMovScriptWorkspaceDir('')
                  setWorkspaceSaved(true)
                }}
              >
                {t('appSettings.movScriptWorkspaceUseDefault')}
              </AppSettingsActionButton>
            </AppSettingsActionRow>
          </AppSettingsSection>

          <AppSettingsSection
            icon={Server}
            title={t('appSettings.cloudApiTitle')}
            description={t('appSettings.cloudApiHint')}
          >
            <AppSettingsField
              label={t('appSettings.apiBaseURL')}
              htmlFor="apiBaseURL"
              help={t('appSettings.apiBaseURLHelp')}
              error={!isValid && apiBaseURL.trim() ? t('appSettings.invalidURL') : undefined}
            >
              <AppSettingsInput
                id="apiBaseURL"
                value={apiBaseURL}
                onChange={(e) => {
                  setAPIBaseURLInput(e.target.value)
                  setSaved(false)
                }}
                placeholder="https://api.example.com"
                spellCheck={false}
              />
            </AppSettingsField>

            <AppSettingsEndpointSurface
              label={t('appSettings.effectiveEndpoint')}
              value={isValid ? `${normalized}/api/v1` : '-'}
            />

            {localMode && isValid && (
              <AppSettingsAdminSurface
                label={t('appSettings.adminConsole')}
                url={adminURL}
                help={t('appSettings.adminConsoleHelp')}
                action={
                  <AppSettingsActionButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openAdminConsole(normalized)}
                  >
                    {t('appSettings.openAdminConsole')}
                  </AppSettingsActionButton>
                }
              />
            )}

            {testState.message && (
              <AppSettingsFeedbackText tone={testState.status === 'error' ? 'danger' : testState.status === 'success' ? 'success' : 'neutral'}>
                {testState.message}
              </AppSettingsFeedbackText>
            )}

            {saved && (
              <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
                {t('appSettings.savedReloading')}
              </AppSettingsFeedbackText>
            )}

            <AppSettingsActionRow>
              <AppSettingsActionButton onClick={saveSettings} disabled={!isValid || !hasChanged}>
                {t('common.save')}
              </AppSettingsActionButton>
              <AppSettingsActionButton variant="outline" onClick={testConnection} disabled={!isValid || testState.status === 'testing'}>
                {testState.status === 'testing' && <RefreshCw size={14} className="mr-2 animate-spin" />}
                {t('appSettings.testConnection')}
              </AppSettingsActionButton>
              <AppSettingsActionButton variant="ghost" onClick={resetToDefault}>
                {t('appSettings.resetDefault')}
              </AppSettingsActionButton>
            </AppSettingsActionRow>
          </AppSettingsSection>

          {localMode && user?.system_role === 'super_admin' && (
            <AppSettingsSection
              icon={HardDrive}
              title={t('appSettings.resourceStorageTitle')}
              description={t('appSettings.resourceStorageHint')}
            >
              <AppSettingsEndpointSurface
                label={t('appSettings.resourceBlobGCEndpoint')}
                value="/api/v1/admin/resource-storage/blobs/gc"
              />

              {resourceGCState.message && (
                <AppSettingsFeedbackText tone={resourceGCState.status === 'error' ? 'danger' : resourceGCState.status === 'success' ? 'success' : 'neutral'}>
                  {resourceGCState.message}
                </AppSettingsFeedbackText>
              )}

              <AppSettingsActionRow>
                <AppSettingsActionButton
                  variant="outline"
                  onClick={() => void collectResourceBlobs(true)}
                  disabled={hasChanged || resourceGCState.status === 'testing'}
                >
                  {resourceGCState.status === 'testing' && <RefreshCw size={14} className="mr-2 animate-spin" />}
                  {t('appSettings.resourceBlobGCDryRun')}
                </AppSettingsActionButton>
                <AppSettingsActionButton
                  variant="ghost"
                  onClick={() => void collectResourceBlobs(false)}
                  disabled={hasChanged || resourceGCState.status === 'testing'}
                >
                  {t('appSettings.resourceBlobGCRun')}
                </AppSettingsActionButton>
              </AppSettingsActionRow>
            </AppSettingsSection>
          )}

          <ExternalResourceSourceSettingsSection />

          <AppSettingsSection
            icon={Clapperboard}
            title={t('appSettings.shotLibraryApiTitle')}
            description={t('appSettings.shotLibraryApiHint')}
          >
            <AppSettingsField
              label={t('appSettings.shotLibrarySources')}
              htmlFor="shotLibrarySources"
              help={t('appSettings.shotLibrarySourcesHelp')}
              error={!shotSourcesValid ? parsedShotSources.error : undefined}
            >
              <Textarea
                id="shotLibrarySources"
                className="app-settings-textarea app-settings-textarea--code"
                value={shotSourcesText}
                onChange={(event) => {
                  setShotSourcesText(event.target.value)
                  setShotSourcesSaved(false)
                }}
                rows={8}
                spellCheck={false}
              />
            </AppSettingsField>

            <AppSettingsEndpointSurface
              label={t('appSettings.shotLibraryStandardApi')}
              value="/api/v1/shot-references"
            />

            {shotSourcesSaved && (
              <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
                {t('appSettings.saved')}
              </AppSettingsFeedbackText>
            )}

            <AppSettingsActionRow>
              <AppSettingsActionButton onClick={saveShotLibrarySources} disabled={!shotSourcesValid || !shotSourcesChanged}>
                {t('common.save')}
              </AppSettingsActionButton>
              <AppSettingsActionButton
                variant="ghost"
                onClick={() => {
                  const resetValue = formatDefaultShotLibrarySources(settings.apiBaseURL)
                  setShotSourcesText(resetValue)
                  setShotSourcesSaved(false)
                }}
              >
                {t('appSettings.resetDefault')}
              </AppSettingsActionButton>
            </AppSettingsActionRow>
          </AppSettingsSection>

          {!user && (
            <AppSettingsFooterText>
              <Link to={ROUTES.root} className="text-foreground underline-offset-4 hover:underline">{t('appSettings.returnToLogin')}</Link>
            </AppSettingsFooterText>
          )}
    </AppSettingsContentStack>
  )

  if (host === 'dialog') return content

  return (
    <AppSettingsShell>
      <AppSettingsHeader
        icon={Settings}
        title={t('appSettings.title')}
        back={
          <AppSettingsBackButton
            type="button"
            onClick={() => user ? navigate(routeForWorkMode(settings.workMode, !!currentProject)) : navigate(ROUTES.root)}
          >
            <ArrowLeft size={16} />
            {t('common.back')}
          </AppSettingsBackButton>
        }
      />

      <AppSettingsMain>
        {content}
      </AppSettingsMain>
    </AppSettingsShell>
  )
}

function ExternalResourceSourceSettingsSection() {
  const qc = useQueryClient()
  const [sourceNames, setSourceNames] = useState<Record<ExternalResourceProviderKey, string>>({
    pexels: 'Pexels',
    pixabay: 'Pixabay',
  })
  const [apiKeys, setApiKeys] = useState<Record<ExternalResourceProviderKey, string>>({
    pexels: '',
    pixabay: '',
  })
  const [savedProvider, setSavedProvider] = useState<ExternalResourceProviderKey | null>(null)
  const { data: queriedSources, isLoading } = useQuery<ExternalResourceSource[]>({
    queryKey: ['external-resource-sources'],
    queryFn: () => api.get('/external-resource-sources').then(r => r.data),
  })
  const sources = queriedSources ?? EMPTY_EXTERNAL_RESOURCE_SOURCES

  useEffect(() => {
    setSourceNames(current => {
      const next = { ...current }
      let changed = false
      for (const provider of EXTERNAL_RESOURCE_PROVIDERS) {
        const source = sourceForProvider(sources, provider.key)
        if (!source) continue
        const name = source.name || provider.name
        if (next[provider.key] === name) continue
        next[provider.key] = name
        changed = true
      }
      return changed ? next : current
    })
  }, [sources])

  const saveSource = useMutation({
    mutationFn: async (provider: ExternalResourceProviderKey) => {
      const providerConfig = EXTERNAL_RESOURCE_PROVIDERS.find(item => item.key === provider)
      const source = sourceForProvider(sources, provider)
      const payload = {
        name: sourceNames[provider].trim() || providerConfig?.name || provider,
        provider_key: provider,
        config: { api_key: apiKeys[provider].trim() },
        priority: EXTERNAL_RESOURCE_PROVIDERS.findIndex(item => item.key === provider),
        is_enabled: true,
      }
      if (source) {
        return api.patch(`/external-resource-sources/${source.ID}`, payload).then(r => r.data as ExternalResourceSource)
      }
      return api.post('/external-resource-sources', payload).then(r => r.data as ExternalResourceSource)
    },
    onSuccess: (source) => {
      const provider = source.provider_key as ExternalResourceProviderKey
      setApiKeys(current => ({ ...current, [provider]: '' }))
      setSavedProvider(provider)
      qc.invalidateQueries({ queryKey: ['external-resource-sources'] })
      toast.success(`${providerDisplayName(provider)} 配置已保存`)
    },
  })

  return (
    <AppSettingsSection
      icon={Image}
      title="外部资源"
      description="配置 Pexels、Pixabay 等外部素材检索来源。保存后可在“外部资源”页面搜索。"
    >
      {EXTERNAL_RESOURCE_PROVIDERS.map(provider => {
        const source = sourceForProvider(sources, provider.key)
        const canSave = Boolean(sourceNames[provider.key].trim() && (apiKeys[provider.key].trim() || source))
        return (
          <AppSettingsContentStack key={provider.key}>
            <AppSettingsField
              label={`${provider.name} 来源名称`}
              htmlFor={`externalResource${provider.name}SourceName`}
              help={source ? `当前来源：${source.name}` : `添加 ${provider.name} API Key 后可搜索。`}
            >
              <AppSettingsInput
                id={`externalResource${provider.name}SourceName`}
                value={sourceNames[provider.key]}
                onChange={(event) => {
                  setSourceNames(current => ({ ...current, [provider.key]: event.target.value }))
                  setSavedProvider(null)
                }}
                placeholder={provider.name}
                disabled={isLoading}
              />
            </AppSettingsField>

            <AppSettingsField
              label={provider.keyLabel}
              htmlFor={provider.fieldId}
              help={source ? '已配置时可留空；填写新 Key 会覆盖当前配置。' : `需要从 ${provider.name} 获取 API Key。`}
            >
              <AppSettingsInput
                id={provider.fieldId}
                type="password"
                value={apiKeys[provider.key]}
                onChange={(event) => {
                  setApiKeys(current => ({ ...current, [provider.key]: event.target.value }))
                  setSavedProvider(null)
                }}
                placeholder={source ? '已配置，可留空' : provider.keyPlaceholder}
                disabled={isLoading}
              />
            </AppSettingsField>

            {savedProvider === provider.key && (
              <AppSettingsFeedbackText tone="success" icon={<CheckCircle2 size={14} />}>
                已保存
              </AppSettingsFeedbackText>
            )}

            <AppSettingsActionRow>
              <AppSettingsActionButton onClick={() => saveSource.mutate(provider.key)} disabled={!canSave || saveSource.isPending || isLoading}>
                {source ? `保存 ${provider.name} 配置` : `添加 ${provider.name} 来源`}
              </AppSettingsActionButton>
            </AppSettingsActionRow>
          </AppSettingsContentStack>
        )
      })}

      <AppSettingsActionRow>
        <AppSettingsActionButton asChild variant="outline">
          <Link to={ROUTES.externalResources}>打开外部资源</Link>
        </AppSettingsActionButton>
      </AppSettingsActionRow>
    </AppSettingsSection>
  )
}

function sourceForProvider(sources: ExternalResourceSource[], provider: ExternalResourceProviderKey) {
  return sources.find(source => source.provider_key === provider)
}

function providerDisplayName(provider: string) {
  return EXTERNAL_RESOURCE_PROVIDERS.find(item => item.key === provider)?.name ?? provider
}

function formatShotLibrarySources(settings: AppSettings): string {
  const sources = settings.shotLibrarySources?.length
    ? settings.shotLibrarySources
    : [{
        id: 'default',
        name: 'Movscript',
        baseURL: settings.apiBaseURL,
        enabled: true,
      }]
  return JSON.stringify({
    defaultSourceId: settings.defaultShotLibrarySourceId ?? sources[0]?.id ?? 'default',
    sources,
  }, null, 2)
}

function formatDefaultShotLibrarySources(apiBaseURL: string): string {
  return JSON.stringify({
    defaultSourceId: 'default',
    sources: [{
      id: 'default',
      name: 'Movscript',
      baseURL: apiBaseURL,
      enabled: true,
      readOnly: false,
    }],
  }, null, 2)
}

type ShotLibrarySourceParseResult =
  | { ok: true; sources: NonNullable<AppSettings['shotLibrarySources']>; defaultSourceId?: string }
  | { ok: false; error: string }

function parseShotLibrarySources(value: string): ShotLibrarySourceParseResult {
  try {
    const parsed = JSON.parse(value) as Partial<AppSettings> & { sources?: unknown; defaultSourceId?: unknown }
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources
      : Array.isArray(parsed.shotLibrarySources)
        ? parsed.shotLibrarySources
        : []
    const normalized = sources.map((source, index) => {
      const item = source as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const baseURL = typeof item.baseURL === 'string' ? item.baseURL.trim() : ''
      if (!id || !name || !baseURL) {
        throw new Error(`sources[${index}] requires id, name, and baseURL`)
      }
      if (!/^https?:\/\/.+/i.test(normalizeAPIBaseURL(baseURL))) {
        throw new Error(`sources[${index}].baseURL must be http(s)`)
      }
      return {
        id,
        name,
        baseURL: normalizeAPIBaseURL(baseURL),
        enabled: item.enabled !== false,
        readOnly: item.readOnly === true,
        authToken: typeof item.authToken === 'string' && item.authToken.trim() ? item.authToken.trim() : undefined,
      }
    })
    if (normalized.length === 0) throw new Error('sources must contain at least one item')
    const defaultSourceId = typeof parsed.defaultSourceId === 'string' ? parsed.defaultSourceId.trim() : undefined
    if (defaultSourceId && !normalized.some(source => source.id === defaultSourceId)) {
      throw new Error('defaultSourceId must match a source id')
    }
    return { ok: true, sources: normalized, defaultSourceId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

export default function AppSettingsPage() {
  return <AppSettingsPanel />
}
