import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, Building2, LayoutDashboard } from 'lucide-react'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { api } from '@/shared/infrastructure/api'
import { authKeys } from '@/features/auth/application/authQueryKeys'
import { AppIconFrame, AppInlineError } from '@movscript/ui/business/app'
import { Button } from '@movscript/ui/primitives'
import { Input } from '@movscript/ui/primitives'
import { Label } from '@movscript/ui/primitives'
import { translateApiError } from '@/shared/infrastructure/apiError'
import type { AuthSession } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { WorkModePrompt, type WorkModeChoice } from '@movscript/ui/business/app'

export default function InvitePage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const currentUser = useUserStore((s) => s.currentUser)
  const setSession = useUserStore((s) => s.setSession)
  const setCurrentOrg = useUserStore((s) => s.setCurrentOrg)
  const setOrgMemberships = useUserStore((s) => s.setOrgMemberships)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [pendingSession, setPendingSession] = useState<(AuthSession & { org_id?: number }) | null>(null)

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: authKeys.invitation(token),
    queryFn: () => api.get(`/invitations/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.post(`/invitations/${token}/accept`, body).then((r) => r.data),
    onSuccess: async (data: AuthSession & { org_id?: number }) => {
      if (!currentUser) {
        setPendingSession(data)
        return
      }
      const orgId = data.org_id ?? invite?.org_id
      if (orgId) {
        try {
          const res = await api.get('/auth/me')
          setOrgMemberships(res.data.org_memberships ?? [], orgId)
        } catch {
          setCurrentOrg(orgId)
        }
        setCurrentProject(null)
      }
      navigate(ROUTES.projects, { replace: true })
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, t('invite.acceptFailed'))),
  })

  function handleAccept() {
    setError('')
    if (currentUser) {
      accept.mutate({})
    } else {
      if (!username.trim()) { setError(t('auth.username') + ' ' + t('invite.required')); return }
      if (!password) { setError(t('auth.password') + ' ' + t('invite.required')); return }
      if (password !== confirmPassword) { setError(t('auth.passwordMismatch')); return }
      accept.mutate({ username, password })
    }
  }

  async function completeInviteLogin(mode: WorkModeChoice) {
    if (!pendingSession) return
    setWorkMode(mode)
    setSession(pendingSession)
    const orgId = pendingSession.org_id ?? invite?.org_id
    if (orgId) {
      setCurrentOrg(orgId)
      setCurrentProject(null)
    }
    navigate(ROUTES.projects, { replace: true })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="type-body text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  if (isError || !invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <p className="type-body font-medium text-foreground mb-1">{t('invite.invalidTitle')}</p>
          <p className="type-label text-muted-foreground">{t('invite.invalidDescription')}</p>
        </div>
      </div>
    )
  }

  if (pendingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-foreground">
        <div className="w-full max-w-4xl">
          <p className="mb-2 type-body font-medium text-primary">Movscript</p>
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
            onSelect={completeInviteLogin}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <AppIconFrame size="lg" className="shrink-0">
            <Building2 size={18} className="text-muted-foreground" />
          </AppIconFrame>
          <div>
            <p className="type-body font-semibold text-foreground">{invite.org_name}</p>
            <p className="type-label text-muted-foreground">
              {t('invite.roleLabel', { role: t(`org.roles.${invite.role}`) })}
            </p>
          </div>
        </div>

        <h1 className="type-title font-bold text-foreground mb-1">{t('invite.title')}</h1>
        <p className="type-body text-muted-foreground mb-6">
          {currentUser
            ? t('invite.subtitleLoggedIn', { org: invite.org_name })
            : t('invite.subtitleRegister', { org: invite.org_name })}
        </p>

        {!currentUser && (
          <div className="space-y-3 mb-4">
            <div>
              <Label htmlFor="invite-username">{t('auth.username')}</Label>
              <Input
                id="invite-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="invite-password">{t('auth.password')}</Label>
              <Input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-confirm">{t('auth.confirmPassword')}</Label>
              <Input
                id="invite-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {error && <AppInlineError className="mb-3">{error}</AppInlineError>}

        <Button className="w-full" onClick={handleAccept} disabled={accept.isPending}>
          {accept.isPending
            ? t('common.loading')
            : currentUser
              ? t('invite.joinButton', { org: invite.org_name })
              : t('invite.registerAndJoin', { org: invite.org_name })}
        </Button>
      </div>
    </div>
  )
}
