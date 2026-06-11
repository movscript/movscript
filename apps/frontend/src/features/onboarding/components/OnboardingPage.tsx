import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot, Cloud, HardDrive, LayoutDashboard, Loader2, User } from 'lucide-react'
import {
  OnboardingActionButton,
  OnboardingFieldError,
  OnboardingFormActions,
  OnboardingFormField,
  OnboardingFormInput,
  OnboardingFormSection,
  OnboardingHero,
  OnboardingLaunchGrid,
  OnboardingLaunchTile,
  OnboardingMain,
  OnboardingShell,
  OnboardingWorkModeSummary,
  WorkModePrompt,
  type WorkModeChoice,
} from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, normalizeAPIBaseURL } from '@/shared/infrastructure/config'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { type AuthSession, useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

type Mode = 'local' | 'cloud'

const LOCAL_API_URL = getLocalAPIBaseURL()

export default function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const completeOnboarding = useAppSettingsStore((s) => s.completeOnboarding)
  const setOnboardingSettings = useAppSettingsStore((s) => s.setOnboardingSettings)
  const setSession = useUserStore((s) => s.setSession)
  const [workMode, setWorkMode] = useState<WorkModeChoice | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [localPassword, setLocalPassword] = useState('')
  const [localPasswordConfirm, setLocalPasswordConfirm] = useState('')
  const [cloudURL, setCloudURL] = useState(getDefaultAPIBaseURL())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const normalizedCloudURL = useMemo(() => {
    try {
      return normalizeAPIBaseURL(cloudURL)
    } catch {
      return cloudURL.trim()
    }
  }, [cloudURL])
  const cloudURLValid = /^https?:\/\/.+/i.test(normalizedCloudURL)
  const localPasswordValid = localPassword.length >= 8
  const localPasswordMatches = localPassword === localPasswordConfirm
  const canStartLocal = displayName.trim().length > 0 && localPasswordValid && localPasswordMatches

  async function startLocal() {
    if (!canStartLocal || loading) return
    setLoading(true)
    setError('')
    try {
      setOnboardingSettings({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
        workMode: workMode ?? 'detail',
        localDisplayName: displayName.trim(),
        onboardingCompleted: false,
      })
      await window.api?.setAppSettings?.({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
        workMode: workMode ?? 'detail',
        onboardingCompleted: false,
        localDisplayName: displayName.trim(),
      })
      await waitForLocalBackend()
      const session = await api.post('/auth/local-bootstrap', {
        displayName: displayName.trim(),
        password: localPassword,
      }).then((r) => r.data as AuthSession)
      setSession(session)
      completeOnboarding({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
        workMode: workMode ?? 'detail',
        localDisplayName: displayName.trim(),
      })
      navigate(ROUTES.projects, { replace: true })
    } catch (err: any) {
      setError(translateApiError(err.response?.data, 'onboarding.localFailed'))
    } finally {
      setLoading(false)
    }
  }

  function startCloud() {
    if (!cloudURLValid) return
    completeOnboarding({
      launchMode: 'cloud',
      apiBaseURL: normalizedCloudURL,
      workMode: workMode ?? 'detail',
    })
    navigate(ROUTES.root, { replace: true })
    window.location.reload()
  }

  return (
    <OnboardingShell>
      <OnboardingMain>
        <OnboardingHero
          brand="Movscript"
          title={workMode ? t('onboarding.title') : t('onboarding.workMode.title')}
          description={workMode ? t('onboarding.description') : t('onboarding.workMode.description')}
        />

        {!workMode && (
          <WorkModePrompt
            agentIcon={Bot}
            detailIcon={LayoutDashboard}
            agentTitle={t('appSettings.agentWorkMode')}
            agentDescription={t('onboarding.workMode.agentDescription')}
            agentAction={t('onboarding.workMode.agentAction')}
            detailTitle={t('appSettings.detailWorkMode')}
            detailDescription={t('onboarding.workMode.detailDescription')}
            detailAction={t('onboarding.workMode.detailAction')}
            onSelect={setWorkMode}
          />
        )}

        {workMode && !mode && (
          <>
            <OnboardingWorkModeSummary
              selectedLabel={t('onboarding.workMode.selected', { mode: workMode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode') })}
              hint={t('onboarding.workMode.switchHint')}
              activeMode={workMode}
              agentIcon={Bot}
              detailIcon={LayoutDashboard}
            />
            <OnboardingLaunchGrid>
              <OnboardingLaunchTile
                type="button"
                onClick={() => setMode('local')}
                icon={HardDrive}
                title={t('onboarding.local.title')}
                description={t('onboarding.local.description')}
                action={t('onboarding.local.action')}
              />

              <OnboardingLaunchTile
                type="button"
                onClick={() => setMode('cloud')}
                icon={Cloud}
                title={t('onboarding.cloud.title')}
                description={t('onboarding.cloud.description')}
                action={t('onboarding.cloud.action')}
              />
            </OnboardingLaunchGrid>
          </>
        )}

        {mode === 'local' && (
          <OnboardingFormSection
            icon={User}
            title={t('onboarding.localIdentity.title')}
            description={t('onboarding.localIdentity.description')}
          >
            <OnboardingFormField htmlFor="displayName" label={t('onboarding.localIdentity.nameLabel')}>
              <OnboardingFormInput
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('onboarding.localIdentity.namePlaceholder')}
                autoFocus
              />
            </OnboardingFormField>

            <OnboardingFormField htmlFor="localPassword" label={t('onboarding.localIdentity.passwordLabel')}>
              <OnboardingFormInput
                id="localPassword"
                type="password"
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                placeholder={t('onboarding.localIdentity.passwordPlaceholder')}
              />
              {localPassword && !localPasswordValid && (
                <OnboardingFieldError>{t('onboarding.localIdentity.passwordHelp')}</OnboardingFieldError>
              )}
            </OnboardingFormField>

            <OnboardingFormField htmlFor="localPasswordConfirm" label={t('onboarding.localIdentity.confirmPasswordLabel')}>
              <OnboardingFormInput
                id="localPasswordConfirm"
                type="password"
                value={localPasswordConfirm}
                onChange={(e) => setLocalPasswordConfirm(e.target.value)}
              />
              {localPasswordConfirm && !localPasswordMatches && (
                <OnboardingFieldError>{t('auth.passwordMismatch')}</OnboardingFieldError>
              )}
            </OnboardingFormField>

            {error && <OnboardingFieldError>{error}</OnboardingFieldError>}

            <OnboardingFormActions>
              <OnboardingActionButton
                onClick={startLocal}
                disabled={!canStartLocal || loading}
                loadingIcon={loading ? <Loader2 size={14} /> : undefined}
              >
                {t('onboarding.localIdentity.create')}
              </OnboardingActionButton>
              <OnboardingActionButton variant="ghost" onClick={() => { setMode(null); setError('') }} disabled={loading}>
                {t('common.back')}
              </OnboardingActionButton>
            </OnboardingFormActions>
          </OnboardingFormSection>
        )}

        {mode === 'cloud' && (
          <OnboardingFormSection
            icon={Cloud}
            title={t('onboarding.cloudConnect.title')}
            description={t('onboarding.cloudConnect.description')}
          >
            <OnboardingFormField htmlFor="cloudURL" label={t('appSettings.apiBaseURL')}>
              <OnboardingFormInput
                id="cloudURL"
                value={cloudURL}
                onChange={(e) => setCloudURL(e.target.value)}
                placeholder="https://api.example.com"
                spellCheck={false}
                autoFocus
              />
              {!cloudURLValid && cloudURL.trim() && (
                <OnboardingFieldError>{t('appSettings.invalidURL')}</OnboardingFieldError>
              )}
            </OnboardingFormField>

            <OnboardingFormActions>
              <OnboardingActionButton onClick={startCloud} disabled={!cloudURLValid}>{t('onboarding.cloudConnect.continue')}</OnboardingActionButton>
              <OnboardingActionButton variant="ghost" onClick={() => setMode(null)}>{t('common.back')}</OnboardingActionButton>
            </OnboardingFormActions>
          </OnboardingFormSection>
        )}
      </OnboardingMain>
    </OnboardingShell>
  )
}

async function waitForLocalBackend(): Promise<void> {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${LOCAL_API_URL}/health`, { cache: 'no-store' })
      if (res.ok) return
    } catch {
      // keep polling while Electron starts the backend
    }
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
}
