import { useEffect, useMemo, useState } from 'react'
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
import {
  getDefaultAPIBaseURL,
  getSettingsDataConnectionBaseURL,
  isLocalDataConnection,
  normalizeAPIBaseURL,
  refreshRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'
import type { ElectronRuntimeConfig } from '@/shared/contracts/electronApi'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@movscript/ui/toast'
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

export function AppSettingsPanel({
  host = 'page',
}: {
  host?: 'page' | 'dialog'
} = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const settings = useAppSettingsStore((s) => s.settings)
  const setDataConnectionURL = useAppSettingsStore((s) => s.setDataConnectionURL)
  const setMovScriptWorkspaceDir = useAppSettingsStore((s) => s.setMovScriptWorkspaceDir)
  const setShotLibrarySources = useAppSettingsStore((s) => s.setShotLibrarySources)
  const resetSettings = useAppSettingsStore((s) => s.reset)
  const [dataConnectionURL, setDataConnectionURLInput] = useState(getSettingsDataConnectionBaseURL(settings))
  const [movScriptHomeDir, setMovScriptHomeDirInput] = useState(settings.movScriptWorkspaceDir ?? '')
  const [shotSourcesText, setShotSourcesText] = useState(formatShotLibrarySources(settings))
  const [saved, setSaved] = useState(false)
  const [workspaceSaved, setWorkspaceSaved] = useState(false)
  const [shotSourcesSaved, setShotSourcesSaved] = useState(false)
  const [testState, setTestState] = useState<AppSettingsTestState>({ status: 'idle', message: '' })
  const [resourceGCState, setResourceGCState] = useState<AppSettingsTestState>({ status: 'idle', message: '' })
  const [runtimeBundleActionState, setRuntimeBundleActionState] = useState<AppSettingsTestState>({ status: 'idle', message: '' })
  const [runtimeConfig, setRuntimeConfig] = useState<ElectronRuntimeConfig | null>(null)

  const localMode = isLocalDataConnection(settings)
  const effectiveDataConnectionURL = getSettingsDataConnectionBaseURL(settings)

  useEffect(() => {
    if (localMode) setDataConnectionURLInput(effectiveDataConnectionURL)
  }, [effectiveDataConnectionURL, localMode])

  useEffect(() => {
    let cancelled = false
    void refreshRuntimeConfigSnapshot()
      .then((snapshot) => {
        if (!cancelled) setRuntimeConfig(snapshot)
      })
      .catch(() => {
        if (!cancelled) setRuntimeConfig(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const normalized = useMemo(() => {
    if (localMode) return effectiveDataConnectionURL
    try {
      return normalizeAPIBaseURL(dataConnectionURL)
    } catch {
      return dataConnectionURL.trim()
    }
  }, [dataConnectionURL, effectiveDataConnectionURL, localMode])
  const hasChanged = !localMode && normalized !== effectiveDataConnectionURL
  const movScriptHomeDirChanged = movScriptHomeDir.trim() !== (settings.movScriptWorkspaceDir ?? '')
  const isValid = /^https?:\/\/.+/i.test(normalized)
  const parsedShotSources = useMemo(() => parseShotLibrarySources(shotSourcesText), [shotSourcesText])
  const shotSourcesValid = parsedShotSources.ok
  const shotSourcesChanged = shotSourcesText.trim() !== formatShotLibrarySources(settings).trim()
  const canOpenAdmin = user?.system_role === 'super_admin'

  async function saveSettings() {
    if (!isValid || localMode) return
    setDataConnectionURL(normalized)
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

  async function chooseMovScriptHomeDir() {
    const selected = await readElectronApi()?.openDirectory?.()
    if (!selected) return
    setMovScriptHomeDirInput(selected)
    setWorkspaceSaved(false)
  }

  function saveShotLibrarySources() {
    if (!parsedShotSources.ok) return
    setShotLibrarySources(parsedShotSources.sources, parsedShotSources.defaultSourceId)
    setShotSourcesSaved(true)
  }

  function resetToDefault() {
    resetSettings()
    setDataConnectionURLInput(getDefaultAPIBaseURL())
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

  async function applyRuntimeBundleAction() {
    const action = runtimeConfig?.runtimeBundleStatus?.action
    if (!action || action === 'keep' || action === 'unknown') return
    const electronApi = readElectronApi()
    if (!electronApi?.applyRuntimeBundleAction) {
      setRuntimeBundleActionState({ status: 'error', message: t('appSettings.runtimeBundleActionUnavailable') })
      return
    }
    setRuntimeBundleActionState({ status: 'testing', message: t('appSettings.runtimeBundleActionRunning') })
    try {
      const result = await electronApi.applyRuntimeBundleAction({ action })
      setRuntimeConfig(result.runtimeConfig)
      const message = t('appSettings.runtimeBundleActionSuccess', {
        action: runtimeBundleActionLabel(action, t),
      })
      setRuntimeBundleActionState({ status: 'success', message })
      toast.success(message)
    } catch (error) {
      setRuntimeBundleActionState({
        status: 'error',
        message: error instanceof Error ? t('appSettings.runtimeBundleActionFailedWithReason', { reason: error.message }) : t('appSettings.runtimeBundleActionFailed'),
      })
    }
  }

  function useDefaultWorkspaceRoot() {
    setMovScriptHomeDirInput('')
    setMovScriptWorkspaceDir('')
    setWorkspaceSaved(true)
  }

  function resetShotLibrarySources() {
    const resetValue = formatDefaultShotLibrarySources(getSettingsDataConnectionBaseURL(settings))
    setShotSourcesText(resetValue)
    setShotSourcesSaved(false)
  }

  const content = (
    <AppSettingsContent
      dataConnectionURL={dataConnectionURL}
      canOpenAdmin={canOpenAdmin}
      collectResourceBlobs={(dryRun) => void collectResourceBlobs(dryRun)}
      chooseMovScriptHomeDir={() => void chooseMovScriptHomeDir()}
      hasChanged={hasChanged}
      isValid={isValid}
      localMode={localMode}
      normalized={normalized}
      openAdminConsole={() => void openAdminConsole()}
      parsedShotSources={parsedShotSources}
      resetShotLibrarySources={resetShotLibrarySources}
      resetToDefault={resetToDefault}
      resourceGCState={resourceGCState}
      runtimeBundleActionState={runtimeBundleActionState}
      applyRuntimeBundleAction={() => void applyRuntimeBundleAction()}
      runtimeConfig={runtimeConfig}
      saveSettings={saveSettings}
      saveShotLibrarySources={saveShotLibrarySources}
      saveWorkspaceRoot={saveWorkspaceRoot}
      saved={saved}
      setDataConnectionURLInput={setDataConnectionURLInput}
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

function runtimeBundleActionLabel(action: NonNullable<ElectronRuntimeConfig['runtimeBundleStatus']>['action'], t: (key: string, options?: Record<string, unknown>) => string): string {
  return t(`appSettings.runtimeBundleAction.${action}`, { defaultValue: action })
}

export default function AppSettingsPage() {
  return <AppSettingsPanel />
}
