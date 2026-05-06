import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cloud, HardDrive, Loader2, User } from 'lucide-react'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { APP_SETTINGS_STORAGE_KEY, getDefaultAPIBaseURL, getLocalAPIBaseURL, normalizeAPIBaseURL } from '@/lib/config'
import { translateApiError } from '@/lib/apiError'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { type AuthSession, useUserStore } from '@/store/userStore'

type Mode = 'local' | 'cloud'

const LOCAL_API_URL = getLocalAPIBaseURL()

export default function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const completeOnboarding = useAppSettingsStore((s) => s.completeOnboarding)
  const setLaunchMode = useAppSettingsStore((s) => s.setLaunchMode)
  const setAPIBaseURL = useAppSettingsStore((s) => s.setAPIBaseURL)
  const setSession = useUserStore((s) => s.setSession)
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
      setLaunchMode('local')
      setAPIBaseURL(LOCAL_API_URL)
      persistOnboardingSettings({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
        localDisplayName: displayName.trim(),
        onboardingCompleted: false,
      })
      await window.api?.setAppSettings?.({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
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
        localDisplayName: displayName.trim(),
      })
      persistOnboardingSettings({
        launchMode: 'local',
        apiBaseURL: LOCAL_API_URL,
        localDisplayName: displayName.trim(),
        onboardingCompleted: true,
      })
      navigate('/projects', { replace: true })
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
    })
    persistOnboardingSettings({
      launchMode: 'cloud',
      apiBaseURL: normalizedCloudURL,
    })
    navigate('/', { replace: true })
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-10">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-sm font-medium text-primary">Movscript</p>
          <h1 className="text-3xl font-semibold tracking-normal">{t('onboarding.title')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t('onboarding.description')}
          </p>
        </div>

        {!mode && (
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('local')}
              className="rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <HardDrive size={20} />
              </div>
              <h2 className="text-base font-semibold">{t('onboarding.local.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('onboarding.local.description')}
              </p>
              <span className="mt-5 inline-flex text-sm font-medium text-primary">{t('onboarding.local.action')}</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('cloud')}
              className="rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Cloud size={20} />
              </div>
              <h2 className="text-base font-semibold">{t('onboarding.cloud.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('onboarding.cloud.description')}
              </p>
              <span className="mt-5 inline-flex text-sm font-medium text-primary">{t('onboarding.cloud.action')}</span>
            </button>
          </div>
        )}

        {mode === 'local' && (
          <section className="max-w-md rounded-lg border border-border bg-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <User size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{t('onboarding.localIdentity.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('onboarding.localIdentity.description')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t('onboarding.localIdentity.nameLabel')}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('onboarding.localIdentity.namePlaceholder')}
                autoFocus
              />
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="localPassword">{t('onboarding.localIdentity.passwordLabel')}</Label>
              <Input
                id="localPassword"
                type="password"
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                placeholder={t('onboarding.localIdentity.passwordPlaceholder')}
              />
              {localPassword && !localPasswordValid && (
                <p className="text-xs text-destructive">{t('onboarding.localIdentity.passwordHelp')}</p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="localPasswordConfirm">{t('onboarding.localIdentity.confirmPasswordLabel')}</Label>
              <Input
                id="localPasswordConfirm"
                type="password"
                value={localPasswordConfirm}
                onChange={(e) => setLocalPasswordConfirm(e.target.value)}
              />
              {localPasswordConfirm && !localPasswordMatches && (
                <p className="text-xs text-destructive">{t('auth.passwordMismatch')}</p>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <div className="mt-6 flex gap-2">
              <Button onClick={startLocal} disabled={!canStartLocal || loading}>
                {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
                {t('onboarding.localIdentity.create')}
              </Button>
              <Button variant="ghost" onClick={() => { setMode(null); setError('') }} disabled={loading}>
                {t('common.back')}
              </Button>
            </div>
          </section>
        )}

        {mode === 'cloud' && (
          <section className="max-w-md rounded-lg border border-border bg-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Cloud size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{t('onboarding.cloudConnect.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('onboarding.cloudConnect.description')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cloudURL">{t('appSettings.apiBaseURL')}</Label>
              <Input
                id="cloudURL"
                value={cloudURL}
                onChange={(e) => setCloudURL(e.target.value)}
                placeholder="https://api.example.com"
                spellCheck={false}
                autoFocus
              />
              {!cloudURLValid && cloudURL.trim() && (
                <p className="text-xs text-destructive">{t('appSettings.invalidURL')}</p>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <Button onClick={startCloud} disabled={!cloudURLValid}>{t('onboarding.cloudConnect.continue')}</Button>
              <Button variant="ghost" onClick={() => setMode(null)}>{t('common.back')}</Button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function persistOnboardingSettings(partial: {
  launchMode: 'local' | 'cloud'
  apiBaseURL: string
  localDisplayName?: string
  onboardingCompleted?: boolean
}): void {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : { state: {} }
    const state = parsed.state ?? {}
    parsed.state = {
      ...state,
      settings: {
        ...(state.settings ?? {}),
        ...partial,
        onboardingCompleted: partial.onboardingCompleted ?? true,
      },
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // The store update above is still the source of truth for the current render.
  }
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
