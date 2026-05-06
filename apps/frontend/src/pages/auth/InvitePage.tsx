import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building2 } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { useProjectStore } from '@/store/projectStore'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { translateApiError } from '@/lib/apiError'
import type { AuthSession } from '@/store/userStore'

export default function InvitePage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const currentUser = useUserStore((s) => s.currentUser)
  const setSession = useUserStore((s) => s.setSession)
  const setCurrentOrg = useUserStore((s) => s.setCurrentOrg)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get(`/invitations/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.post(`/invitations/${token}/accept`, body).then((r) => r.data),
    onSuccess: (data: AuthSession & { org_id?: number }) => {
      if (!currentUser) {
        setSession(data)
      }
      const orgId = data.org_id ?? invite?.org_id
      if (orgId) {
        setCurrentOrg(orgId)
        setCurrentProject(null)
      }
      navigate('/projects', { replace: true })
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  if (isError || !invite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-foreground mb-1">{t('invite.invalidTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('invite.invalidDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{invite.org_name}</p>
            <p className="text-xs text-muted-foreground">
              {t('invite.roleLabel', { role: t(`org.roles.${invite.role}`) })}
            </p>
          </div>
        </div>

        <h1 className="text-xl font-bold text-foreground mb-1">{t('invite.title')}</h1>
        <p className="text-sm text-muted-foreground mb-6">
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

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

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
