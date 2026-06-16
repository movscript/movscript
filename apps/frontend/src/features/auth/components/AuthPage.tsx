import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, LayoutDashboard, Settings } from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { authKeys } from '@/features/auth/application/authQueryKeys'
import { getAPIBaseURL, isLocalLaunchMode } from '@/shared/infrastructure/config'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { type AuthSession, useUserStore } from '@/shared/infrastructure/session/userStore'
import {
  AuthActionButton,
  AuthBrandMark,
  AuthEmailCodeField,
  AuthEmailCodeRow,
  AuthField,
  AuthFooterText,
  AuthFormStack,
  AuthInlineLinkButton,
  AuthInlineMeta,
  AuthInput,
  AuthLabel,
  AuthPanel,
  AuthPasswordInput,
  AuthRegisterPrompt,
  AuthRoot,
  AuthSettingsButton,
  AuthStateMessage,
  AuthSubmitButton,
  AuthTabButton,
  AuthTabs,
  AuthTagline,
  AuthTitle,
  AuthTurnstileSlot,
  AuthWorkModePanel,
  AuthWorkModeRoot,
} from '@/features/auth/components/AuthPageUi'
import {
  WorkModePrompt,
  type WorkModeChoice
} from '@movscript/ui/business/app'

type Tab = 'login' | 'register'

type AuthConfig = {
  registration_enabled: boolean
  require_email_verification: boolean
  email_verification_enabled: boolean
  turnstile?: {
    enabled?: boolean
    site_key?: string
  }
  local_bootstrap_enabled: boolean
  bootstrap_required?: boolean
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void }) => string
      reset: (widgetId?: string) => void
      remove?: (widgetId: string) => void
    }
  }
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
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0)
  const [error, setError] = useState('')
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null)

  const authConfig = useQuery<AuthConfig>({
    queryKey: authKeys.config,
    queryFn: () => api.get('/auth/config').then((r) => r.data),
  })
  const config = authConfig.data
  const localMode = isLocalLaunchMode(settings)
  const bootstrapRequired = !!config?.bootstrap_required
  const registrationEnabled = !!config?.registration_enabled || localMode || bootstrapRequired
  const requiresEmail = tab === 'register' && !localMode && !bootstrapRequired && !!config?.require_email_verification
  const turnstileEnabled = !localMode && !bootstrapRequired && !!config?.turnstile?.enabled && !!config?.turnstile?.site_key
  const turnstileReady = !turnstileEnabled || !!turnstileToken
  const clearTurnstileChallenge = useCallback(() => {
    setTurnstileToken('')
    setTurnstileResetSignal((current) => current + 1)
  }, [])

  const login = useMutation({
    mutationFn: () => api.post('/auth/login', { username, password, turnstile: turnstileToken }).then((r) => r.data as AuthSession),
    onSuccess: finishAuth,
    onSettled: () => { if (turnstileEnabled) clearTurnstileChallenge() },
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.loginFailed'))
  })

  const register = useMutation({
    mutationFn: () => api.post('/auth/register', {
      username,
      password,
      challengeId,
      code,
      localAdmin: localMode || bootstrapRequired,
      turnstile: turnstileToken,
    }).then((r) => r.data as AuthSession),
    onSuccess: finishAuth,
    onSettled: () => { if (turnstileEnabled) clearTurnstileChallenge() },
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.registerFailed'))
  })
  const startCode = useMutation({
    mutationFn: () => api.post('/auth/code/start', { target: email, purpose: 'register', turnstile: turnstileToken }).then((r) => r.data as { challengeId: string; expiresIn: number; devCode?: string }),
    onSuccess: (result) => {
      setChallengeId(result.challengeId)
      if (result.devCode) setCode(result.devCode)
      setError('')
    },
    onSettled: () => { if (turnstileEnabled) clearTurnstileChallenge() },
    onError: (e: any) => setError(translateApiError(e.response?.data, 'auth.codeSendFailed')),
  })

  function handleSubmit() {
    setError('')
    if (!username.trim() || !password) return
    if (!turnstileReady) { setError(t('auth.turnstileRequired', { defaultValue: '请先完成人机验证' })); return }
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
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSubmit()
  const resetTurnstile = useCallback(() => setTurnstileToken(''), [])

  async function finishAuth(session: AuthSession) {
    if (settings.onboardingCompleted) {
      setSession(session)
      return
    }
    setPendingSession(session)
  }

  async function completeLogin(mode: WorkModeChoice) {
    if (!pendingSession) return
    setWorkMode(mode)
    setSession(pendingSession)
  }

  if (pendingSession) {
    return (
      <AuthWorkModeRoot>
        <AuthWorkModePanel>
          <AuthBrandMark>Movscript</AuthBrandMark>
          <WorkModePrompt
            agentIcon={Bot}
            projectIcon={LayoutDashboard}
            title={t('auth.workModeTitle')}
            description={t('auth.workModeDescription')}
            agentTitle={t('appSettings.agentWorkMode')}
            agentDescription={t('onboarding.workMode.agentDescription')}
            agentAction={t('onboarding.workMode.agentAction')}
            projectTitle={t('appSettings.projectWorkMode', { defaultValue: '项目模式' })}
            projectDescription={t('onboarding.workMode.projectDescription')}
            projectAction={t('onboarding.workMode.projectAction')}
            onSelect={completeLogin}
          />
        </AuthWorkModePanel>
      </AuthWorkModeRoot>
    )
  }

  return (
    <AuthRoot>
      <AuthSettingsButton asChild>
        <Link
          to="/app/settings"
          aria-label={t('appSettings.title')}
          title={t('appSettings.title')}
        >
          <Settings size={16} />
        </Link>
      </AuthSettingsButton>
      <AuthPanel>
        <AuthTitle>Movscript</AuthTitle>
        <AuthTagline>{t('auth.tagline')}</AuthTagline>
        {bootstrapRequired && (
          <AuthStateMessage>
            {t('auth.bootstrapRequiredHint')}
          </AuthStateMessage>
        )}

        <AuthTabs>
          {(['login', 'register'] as Tab[]).filter((tabName) => tabName !== 'register' || registrationEnabled).map((tabName) => (
            <AuthTabButton
              key={tabName}
              active={tab === tabName}
              onClick={() => { setTab(tabName); setError('') }}
            >
              {tabName === 'login' ? t('auth.login') : t('auth.register')}
            </AuthTabButton>
          ))}
        </AuthTabs>

        <AuthFormStack>
          <AuthField>
            <AuthLabel htmlFor="username" screenReaderOnly>{t('auth.username')}</AuthLabel>
            <AuthInput
              id="username"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
              autoFocus
            />
          </AuthField>
          <AuthPasswordInput placeholder={t('auth.password')} value={password} onChange={setPassword} onKeyDown={onEnter} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
          {tab === 'register' && (
            <>
              {requiresEmail && (
                <AuthEmailCodeField>
                  <AuthLabel htmlFor="email" screenReaderOnly>{t('auth.email')}</AuthLabel>
                  <AuthEmailCodeRow>
                    <AuthInput
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
                    <AuthActionButton type="button" variant="outline" onClick={() => startCode.mutate()} disabled={startCode.isPending || !email.trim() || !turnstileReady}>
                      {startCode.isPending ? t('auth.sendingCode') : t('auth.sendCode')}
                    </AuthActionButton>
                  </AuthEmailCodeRow>
                  <AuthInput
                    placeholder={t('auth.emailCode')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={onEnter}
                  />
                </AuthEmailCodeField>
              )}
              <AuthPasswordInput placeholder={t('auth.confirmPassword')} value={confirm} onChange={setConfirm} onKeyDown={onEnter} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
            </>
          )}

          {turnstileEnabled && config?.turnstile?.site_key && (
            <TurnstileWidget
              siteKey={config.turnstile.site_key}
              resetSignal={turnstileResetSignal}
              onVerify={setTurnstileToken}
              onReset={resetTurnstile}
            />
          )}

          {error && <AuthStateMessage tone="danger">{error}</AuthStateMessage>}

          <AuthSubmitButton
            onClick={handleSubmit}
            disabled={loading || !username.trim() || !password || !turnstileReady}
          >
            {loading ? t('auth.pleaseWait') : tab === 'login' ? t('auth.login') : t('auth.register')}
          </AuthSubmitButton>
        </AuthFormStack>

        <AuthFooterText>
          {t('appSettings.currentApi')}: <AuthInlineMeta asChild>
            <span>{getAPIBaseURL()}</span>
          </AuthInlineMeta>
        </AuthFooterText>
        <AuthFooterText>
          {t('appSettings.launchMode')}: {isLocalLaunchMode(settings) ? t('appSettings.localMode') : t('appSettings.cloudMode')}
        </AuthFooterText>

        {tab === 'login' && (
          <AuthRegisterPrompt>
            {registrationEnabled ? (
              <>
                {t('auth.noAccount')}
                <AuthInlineLinkButton onClick={() => setTab('register')}>
                  {t('auth.registerNow')}
                </AuthInlineLinkButton>
              </>
            ) : t('auth.registrationClosedHint')}
          </AuthRegisterPrompt>
        )}
      </AuthPanel>
    </AuthRoot>
  )
}

function TurnstileWidget({
  siteKey,
  resetSignal,
  onVerify,
  onReset,
}: {
  siteKey: string
  resetSignal: number
  onVerify: (token: string) => void
  onReset: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string>()

  useEffect(() => {
    let cancelled = false

    function render() {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': onReset,
        'error-callback': onReset,
      })
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-movscript-turnstile="true"]')
    if (existing) {
      if (window.turnstile) render()
      else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.movscriptTurnstile = 'true'
      script.addEventListener('load', render, { once: true })
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current)
      }
      widgetIdRef.current = undefined
      onReset()
    }
  }, [onReset, onVerify, siteKey])

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      onReset()
    }
  }, [onReset, resetSignal])

  return <AuthTurnstileSlot ref={containerRef} />
}
