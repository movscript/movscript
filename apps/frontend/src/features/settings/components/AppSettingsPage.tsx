import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Settings } from 'lucide-react'
import {
  AppSettingsBackButton,
  AppSettingsHeader,
  AppSettingsMain,
  AppSettingsShell
} from '@/features/settings/components/AppSettingsUi'
import { AppSettingsContent } from '@/features/settings/components/AppSettingsSections'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL, type AppSettings } from '@/shared/infrastructure/config'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import { routeForWorkMode } from '@/routes/appRouteModel'
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
  const [movScriptHomeDir, setMovScriptHomeDirInput] = useState(settings.movScriptWorkspaceDir ?? '')
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
  const movScriptHomeDirChanged = movScriptHomeDir.trim() !== (settings.movScriptWorkspaceDir ?? '')
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
    setMovScriptWorkspaceDir(movScriptHomeDir)
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
    setMovScriptHomeDirInput('')
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

  function useDefaultWorkspaceRoot() {
    setMovScriptHomeDirInput('')
    setMovScriptWorkspaceDir('')
    setWorkspaceSaved(true)
  }

  function resetShotLibrarySources() {
    const resetValue = formatDefaultShotLibrarySources(settings.apiBaseURL)
    setShotSourcesText(resetValue)
    setShotSourcesSaved(false)
  }

  const content = (
    <AppSettingsContent
      apiBaseURL={apiBaseURL}
      canOpenAdmin={canOpenAdmin}
      chooseLaunchMode={chooseLaunchMode}
      chooseWorkMode={chooseWorkMode}
      collectResourceBlobs={(dryRun) => void collectResourceBlobs(dryRun)}
      hasChanged={hasChanged}
      isValid={isValid}
      localMode={localMode}
      normalized={normalized}
      openAdminConsole={() => void openAdminConsole()}
      parsedShotSources={parsedShotSources}
      resetShotLibrarySources={resetShotLibrarySources}
      resetToDefault={resetToDefault}
      resourceGCState={resourceGCState}
      saveSettings={saveSettings}
      saveShotLibrarySources={saveShotLibrarySources}
      saveWorkspaceRoot={saveWorkspaceRoot}
      saved={saved}
      setAPIBaseURLInput={setAPIBaseURLInput}
      setSaved={setSaved}
      setShotSourcesSaved={setShotSourcesSaved}
      setShotSourcesText={setShotSourcesText}
      setMovScriptHomeDirInput={setMovScriptHomeDirInput}
      setWorkspaceSaved={setWorkspaceSaved}
      settings={settings}
      shotSourcesChanged={shotSourcesChanged}
      shotSourcesSaved={shotSourcesSaved}
      shotSourcesText={shotSourcesText}
      shotSourcesValid={shotSourcesValid}
      showLoginFooter={!user}
      testConnection={testConnection}
      testState={testState}
      useDefaultWorkspaceRoot={useDefaultWorkspaceRoot}
      movScriptHomeDir={movScriptHomeDir}
      movScriptHomeDirChanged={movScriptHomeDirChanged}
      workspaceSaved={workspaceSaved}
    />
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
