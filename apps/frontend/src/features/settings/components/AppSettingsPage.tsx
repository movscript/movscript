import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, Clapperboard, HardDrive, LayoutDashboard, RefreshCw, Server, Settings, Wrench } from 'lucide-react'
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
  AppSettingsShell
} from '@movscript/ui/business/app'
import { Textarea } from '@movscript/ui/primitives'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL, type AppSettings } from '@/shared/infrastructure/config'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import { routeForWorkMode } from '@/routes/appRouteModel'
import { ExternalResourceSourceSettingsSection } from '@/features/settings/components/ExternalResourceSourceSettingsSection'
import {
  formatBytes,
  formatDefaultShotLibrarySources,
  formatShotLibrarySources,
  healthURL,
  parseShotLibrarySources,
  type AppSettingsTestState,
  type ResourceBlobGCResult,
} from '@/features/settings/presentation/appSettingsPageModel'

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
  const [testState, setTestState] = useState<AppSettingsTestState>({ status: 'idle', message: '' })
  const [resourceGCState, setResourceGCState] = useState<AppSettingsTestState>({ status: 'idle', message: '' })

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
  const canOpenAdmin = user?.system_role === 'super_admin'

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
              {(['project', 'tool', 'agent'] as const).map((mode) => {
                const selected = settings.workMode === mode
                const Icon = mode === 'agent' ? Bot : mode === 'tool' ? Wrench : LayoutDashboard
                return (
                  <AppSettingsChoiceTile
                    key={mode}
                    type="button"
                    selected={selected}
                    onClick={() => chooseWorkMode(mode)}
                    icon={<Icon size={14} />}
                    title={mode === 'agent'
                      ? t('appSettings.agentWorkMode')
                      : mode === 'tool'
                        ? t('appSettings.toolWorkMode', { defaultValue: '工具模式' })
                        : t('appSettings.projectWorkMode', { defaultValue: '项目模式' })}
                    detail={mode === 'agent'
                      ? t('appSettings.agentWorkModeHelp')
                      : mode === 'tool'
                        ? t('appSettings.toolWorkModeHelp', { defaultValue: '直接进入工具、资源和任务入口，不显示右侧 AI 会话面板。' })
                        : t('appSettings.projectWorkModeHelp', { defaultValue: '选择项目后进入项目总览，再进入剧本、编排和项目规范。' })}
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

            {localMode && isValid && canOpenAdmin && (
              <AppSettingsAdminSurface
                label={t('appSettings.adminConsole')}
                url={t('appSettings.adminConsoleHost')}
                help={t('appSettings.adminConsoleHelp')}
                action={
                  <AppSettingsActionButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openAdminConsole()}
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

          <ExternalResourceSourceSettingsSection canOpenAdmin={isValid && canOpenAdmin} />

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

export default function AppSettingsPage() {
  return <AppSettingsPanel />
}
