import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Settings } from 'lucide-react'
import { api } from '@/lib/api'
import { getAPIBaseURL, isLocalLaunchMode } from '@/lib/config'
import { translateApiError } from '@/lib/apiError'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { type AuthSession, useUserStore } from '@/store/userStore'
import { WorkModePrompt, type WorkModeChoice } from '@/components/app/WorkModePrompt'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'

type Tab = 'login' | 'register'

type AuthConfig = {
  registration_enabled: boolean
  require_email_verification: boolean
  email_verification_enabled: boolean
  local_bootstrap_enabled: boolean
  bootstrap_required?: boolean
}

function PasswordInput({ placeholder, value, onChange, onKeyDown }: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export default function AuthPage() {
  const { t } = useTranslation()
  const setSession = useUserStore((s) => s.setSession)
  const settings = useAppSettingsStore((s) => s.settings)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const [tab, setTab] = useState<Tab>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState('')
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null)

  const authConfig = useQuery<AuthConfig>({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get('/auth/config').then((r) => r.data),
  })
  const config = authConfig.data
  const localMode = isLocalLaunchMode(settings)
  const bootstrapRequired = !!config?.bootstrap_required
  const registrationEnabled = !!config?.registration_enabled || localMode || bootstrapRequired
  const requiresEmail = tab === 'register' && !localMode && !bootstrapRequired && !!config?.require_email_verification

  const login = useMutation({
    mutationFn: () => api.post('/auth/login', { username, password }).then((r) => r.data as AuthSession),
    onSuccess: setPendingSession,
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.loginFailed'))
  })

  const register = useMutation({
    mutationFn: () => api.post('/auth/register', {
      username,
      password,
      challengeId,
      code,
      localAdmin: localMode || bootstrapRequired,
    }).then((r) => r.data as AuthSession),
    onSuccess: setPendingSession,
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.registerFailed'))
  })
  const startCode = useMutation({
    mutationFn: () => api.post('/auth/code/start', { target: email, purpose: 'register' }).then((r) => r.data as { challengeId: string; expiresIn: number; devCode?: string }),
    onSuccess: (result) => {
      setChallengeId(result.challengeId)
      if (result.devCode) setCode(result.devCode)
      setError('')
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.codeSendFailed')),
  })

  function handleSubmit() {
    setError('')
    if (!username.trim() || !password) return
    if (tab === 'register') {
      if (!registrationEnabled) { setError(t('auth.registrationClosed')); return }
      if (password !== confirm) { setError(t('auth.passwordMismatch')); return }
      if (requiresEmail && (!email.trim() || !challengeId || !code.trim())) { setError(t('auth.emailCodeRequired')); return }
      register.mutate()
    } else {
      login.mutate()
    }
  }

  const loading = login.isPending || register.isPending
  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && handleSubmit()

  function completeLogin(mode: WorkModeChoice) {
    if (!pendingSession) return
    setWorkMode(mode)
    setSession(pendingSession)
  }

  if (pendingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-foreground">
        <div className="w-full max-w-4xl">
          <p className="mb-2 type-body font-medium text-primary">Movscript</p>
          <WorkModePrompt
            title={t('auth.workModeTitle')}
            description={t('auth.workModeDescription')}
            onSelect={completeLogin}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Link
        to="/app/settings"
        className="absolute right-5 top-5 inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={t('appSettings.title')}
        title={t('appSettings.title')}
      >
        <Settings size={16} />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="type-page-title font-bold text-foreground mb-1">Movscript</h1>
        <p className="type-body text-muted-foreground mb-8">{t('auth.tagline')}</p>
        {bootstrapRequired && (
          <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 type-label text-muted-foreground">
            {t('auth.bootstrapRequiredHint')}
          </p>
        )}

        <div className="flex border-b border-border mb-6">
          {(['login', 'register'] as Tab[]).filter((tabName) => tabName !== 'register' || registrationEnabled).map((tabName) => (
            <button
              key={tabName}
              onClick={() => { setTab(tabName); setError('') }}
              className={`flex-1 pb-2 type-body font-medium transition-colors ${
                tab === tabName
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabName === 'login' ? t('auth.login') : t('auth.register')}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="username" className="sr-only">{t('auth.username')}</Label>
            <Input
              id="username"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
              autoFocus
            />
          </div>
          <PasswordInput placeholder={t('auth.password')} value={password} onChange={setPassword} onKeyDown={onEnter} />
          {tab === 'register' && (
            <>
              {requiresEmail && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="sr-only">{t('auth.email')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.email')}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setChallengeId('')
                      }}
                      onKeyDown={onEnter}
                    />
                    <Button type="button" variant="outline" onClick={() => startCode.mutate()} disabled={startCode.isPending || !email.trim()}>
                      {startCode.isPending ? t('auth.sendingCode') : t('auth.sendCode')}
                    </Button>
                  </div>
                  <Input
                    placeholder={t('auth.emailCode')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={onEnter}
                  />
                </div>
              )}
              <PasswordInput placeholder={t('auth.confirmPassword')} value={confirm} onChange={setConfirm} onKeyDown={onEnter} />
            </>
          )}

          {error && <p className="type-label text-destructive">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={loading || !username.trim() || !password}
            className="w-full"
          >
            {loading ? t('auth.pleaseWait') : tab === 'login' ? t('auth.login') : t('auth.register')}
          </Button>
        </div>

        <p className="mt-4 truncate text-center type-label text-muted-foreground">
          {t('appSettings.currentApi')}: <span className="font-mono">{getAPIBaseURL()}</span>
        </p>
        <p className="mt-2 text-center type-label text-muted-foreground">
          {t('appSettings.launchMode')}: {isLocalLaunchMode(settings) ? t('appSettings.localMode') : t('appSettings.cloudMode')}
        </p>

        {tab === 'login' && (
          <p className="type-label text-muted-foreground text-center mt-5">
            {registrationEnabled ? (
              <>
                {t('auth.noAccount')}
                <button onClick={() => setTab('register')} className="text-foreground hover:underline ml-1 transition-colors">{t('auth.registerNow')}</button>
              </>
            ) : t('auth.registrationClosedHint')}
          </p>
        )}
      </div>
    </div>
  )
}
