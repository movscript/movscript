import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, LayoutDashboard, RefreshCw, Server, Settings } from 'lucide-react'
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
} from '@movscript/ui'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL, type AppSettings } from '@/shared/infrastructure/config'
import { adminConsoleURL, openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import { routeForWorkMode } from '@/routes/appRouteModel'

type TestState =
  | { status: 'idle'; message: string }
  | { status: 'testing'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

function healthURL(baseURL: string): string {
  return `${normalizeAPIBaseURL(baseURL)}/health`
}

export default function AppSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const settings = useAppSettingsStore((s) => s.settings)
  const setLaunchMode = useAppSettingsStore((s) => s.setLaunchMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const setAPIBaseURL = useAppSettingsStore((s) => s.setAPIBaseURL)
  const resetSettings = useAppSettingsStore((s) => s.reset)
  const [apiBaseURL, setAPIBaseURLInput] = useState(settings.apiBaseURL)
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<TestState>({ status: 'idle', message: '' })

  const normalized = useMemo(() => {
    try {
      return normalizeAPIBaseURL(apiBaseURL)
    } catch {
      return apiBaseURL.trim()
    }
  }, [apiBaseURL])
  const hasChanged = normalized !== settings.apiBaseURL
  const isValid = /^https?:\/\/.+/i.test(normalized)
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
    if (!currentProject) {
      navigate(ROUTES.projects)
      return
    }
    navigate(routeForWorkMode(mode, true))
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

  function resetToDefault() {
    resetSettings()
    setAPIBaseURLInput(getDefaultAPIBaseURL())
    setSaved(true)
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

          {!user && (
            <AppSettingsFooterText>
              <Link to={ROUTES.root} className="text-foreground underline-offset-4 hover:underline">{t('appSettings.returnToLogin')}</Link>
            </AppSettingsFooterText>
          )}
        </AppSettingsContentStack>
      </AppSettingsMain>
    </AppSettingsShell>
  )
}
