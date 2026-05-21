import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bot, CheckCircle2, LayoutDashboard, RefreshCw, Server, Settings } from 'lucide-react'
import { Button, Input, Label } from '@movscript/ui'
import { getDefaultAPIBaseURL, getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL, type AppSettings } from '@/lib/config'
import { adminConsoleURL, openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { ROUTES } from '@/routes/projectRoutes'

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
    navigate(mode === 'agent' ? ROUTES.project.agent : ROUTES.project.overview)
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <button
            type="button"
            onClick={() => user ? navigate(currentProject ? (settings.workMode === 'agent' ? ROUTES.project.agent : ROUTES.project.overview) : ROUTES.projects) : navigate(ROUTES.root)}
            className="inline-flex items-center gap-2 type-body text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t('common.back')}
          </button>
          <div className="inline-flex items-center gap-2 type-body font-medium">
            <Settings size={16} />
            {t('appSettings.title')}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <section className="space-y-6">
          <div>
            <h1 className="type-title font-semibold">{t('appSettings.title')}</h1>
            <p className="mt-2 type-body text-muted-foreground">{t('appSettings.description')}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Settings size={18} />
              </div>
              <div>
                <h2 className="type-body font-semibold">{t('appSettings.launchModeTitle')}</h2>
                <p className="type-label text-muted-foreground">{t('appSettings.launchModeHint')}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(['cloud', 'local'] as const).map((mode) => {
                const selected = settings.launchMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => chooseLaunchMode(mode)}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="block type-body font-medium">
                      {mode === 'cloud' ? t('appSettings.cloudMode') : t('appSettings.localMode')}
                    </span>
                    <span className="mt-1 block type-label">
                      {mode === 'cloud' ? t('appSettings.cloudModeHelp') : t('appSettings.localModeHelp')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bot size={18} />
              </div>
              <div>
                <h2 className="type-body font-semibold">{t('appSettings.workModeTitle')}</h2>
                <p className="type-label text-muted-foreground">{t('appSettings.workModeHint')}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(['detail', 'agent'] as const).map((mode) => {
                const selected = settings.workMode === mode
                const Icon = mode === 'agent' ? Bot : LayoutDashboard
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => chooseWorkMode(mode)}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2 type-body font-medium">
                      <Icon size={14} />
                      {mode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
                    </span>
                    <span className="mt-1 block type-label">
                      {mode === 'agent' ? t('appSettings.agentWorkModeHelp') : t('appSettings.detailWorkModeHelp')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Server size={18} />
              </div>
              <div>
                <h2 className="type-body font-semibold">{t('appSettings.cloudApiTitle')}</h2>
                <p className="type-label text-muted-foreground">{t('appSettings.cloudApiHint')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiBaseURL">{t('appSettings.apiBaseURL')}</Label>
              <Input
                id="apiBaseURL"
                value={apiBaseURL}
                onChange={(e) => {
                  setAPIBaseURLInput(e.target.value)
                  setSaved(false)
                }}
                placeholder="https://api.example.com"
                spellCheck={false}
              />
              <p className="type-label text-muted-foreground">{t('appSettings.apiBaseURLHelp')}</p>
              {!isValid && apiBaseURL.trim() && (
                <p className="type-label text-destructive">{t('appSettings.invalidURL')}</p>
              )}
            </div>

            <div className="mt-5 rounded-md bg-muted px-3 py-2 type-label text-muted-foreground">
              {t('appSettings.effectiveEndpoint')}: <span className="font-mono text-foreground">{isValid ? `${normalized}/api/v1` : '-'}</span>
            </div>

            {localMode && isValid && (
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 type-label text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t('appSettings.adminConsole')}: <span className="font-mono text-foreground">{adminURL}</span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openAdminConsole(normalized)}
                  >
                    {t('appSettings.openAdminConsole')}
                  </Button>
                </div>
                <p className="mt-2 leading-5">{t('appSettings.adminConsoleHelp')}</p>
              </div>
            )}

            {testState.message && (
              <p className={`mt-3 type-label ${testState.status === 'error' ? 'text-destructive' : testState.status === 'success' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {testState.message}
              </p>
            )}

            {saved && (
              <p className="mt-3 inline-flex items-center gap-1.5 type-label text-emerald-600">
                <CheckCircle2 size={14} />
                {t('appSettings.savedReloading')}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={saveSettings} disabled={!isValid || !hasChanged}>
                {t('common.save')}
              </Button>
              <Button variant="outline" onClick={testConnection} disabled={!isValid || testState.status === 'testing'}>
                {testState.status === 'testing' && <RefreshCw size={14} className="mr-2 animate-spin" />}
                {t('appSettings.testConnection')}
              </Button>
              <Button variant="ghost" onClick={resetToDefault}>
                {t('appSettings.resetDefault')}
              </Button>
            </div>
          </div>

          {!user && (
            <p className="text-center type-body text-muted-foreground">
              <Link to={ROUTES.root} className="text-foreground underline-offset-4 hover:underline">{t('appSettings.returnToLogin')}</Link>
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
