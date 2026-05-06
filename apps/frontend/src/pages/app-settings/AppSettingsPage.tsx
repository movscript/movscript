import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, RefreshCw, Server, Settings } from 'lucide-react'
import { Button, Input, Label } from '@movscript/ui'
import { getDefaultAPIBaseURL, normalizeAPIBaseURL } from '@/lib/config'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { useUserStore } from '@/store/userStore'

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
  const settings = useAppSettingsStore((s) => s.settings)
  const setLaunchMode = useAppSettingsStore((s) => s.setLaunchMode)
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
            onClick={() => user ? navigate('/projects') : navigate('/')}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {t('common.back')}
          </button>
          <div className="inline-flex items-center gap-2 text-sm font-medium">
            <Settings size={16} />
            {t('appSettings.title')}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <section className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold">{t('appSettings.title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('appSettings.description')}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Settings size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{t('appSettings.launchModeTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('appSettings.launchModeHint')}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(['cloud', 'local'] as const).map((mode) => {
                const selected = settings.launchMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLaunchMode(mode)}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {mode === 'cloud' ? t('appSettings.cloudMode') : t('appSettings.localMode')}
                    </span>
                    <span className="mt-1 block text-xs">
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
                <Server size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{t('appSettings.cloudApiTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('appSettings.cloudApiHint')}</p>
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
              <p className="text-xs text-muted-foreground">{t('appSettings.apiBaseURLHelp')}</p>
              {!isValid && apiBaseURL.trim() && (
                <p className="text-xs text-destructive">{t('appSettings.invalidURL')}</p>
              )}
            </div>

            <div className="mt-5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t('appSettings.effectiveEndpoint')}: <span className="font-mono text-foreground">{isValid ? `${normalized}/api/v1` : '-'}</span>
            </div>

            {testState.message && (
              <p className={`mt-3 text-xs ${testState.status === 'error' ? 'text-destructive' : testState.status === 'success' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {testState.message}
              </p>
            )}

            {saved && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600">
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
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/" className="text-foreground underline-offset-4 hover:underline">{t('appSettings.returnToLogin')}</Link>
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
