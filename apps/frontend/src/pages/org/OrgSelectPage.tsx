import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Building2, CircleUserRound, KeyRound, Plus, ChevronRight, Settings } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { useProjectStore } from '@/store/projectStore'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@movscript/ui'
import { translateApiError } from '@/lib/apiError'
import type { OrgMembership } from '@/types'
import { ROUTES } from '@/routes/projectRoutes'
import OrgSettingsPage from './OrgSettingsPage'

function roleLabel(role: OrgMembership['role'], t: (k: string) => string) {
  const map: Record<string, string> = {
    owner: t('org.roles.owner'),
    admin: t('org.roles.admin'),
    member: t('org.roles.member'),
    viewer: t('org.roles.viewer'),
  }
  return map[role] ?? role
}

function CreateOrgDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (orgId: number) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/orgs', { name, slug }).then((r) => r.data),
    onSuccess: (org) => onCreated(org.ID),
    onError: (e: any) => setError(translateApiError(e.response?.data, t('org.createFailed'))),
  })

  function handleSlugChange(v: string) {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-'))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('org.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="org-name">{t('org.name')}</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (!slug) handleSlugChange(e.target.value) }}
              placeholder={t('org.namePlaceholder')}
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="org-slug">{t('org.slug')}</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder={t('org.slugPlaceholder')}
              className="mt-1"
            />
            <p className="type-label text-muted-foreground mt-1">{t('org.slugHint')}</p>
          </div>
          {error && <p className="type-label text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || !slug.trim() || create.isPending}>
            {create.isPending ? t('common.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JoinOrgDialog({ onClose, onJoined }: { onClose: () => void; onJoined: (orgId: number) => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const join = useMutation({
    mutationFn: () => api.post('/orgs/join', { code: code.trim() }).then((r) => r.data),
    onSuccess: (data) => onJoined(data.org_id),
    onError: (e: any) => setError(translateApiError(e.response?.data, t('org.joinFailed'))),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('org.joinTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="org-code">{t('org.code')}</Label>
            <Input
              id="org-code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder={t('org.codePlaceholder')}
              className="mt-1 font-mono"
              autoFocus
            />
            <p className="type-label text-muted-foreground mt-1">{t('org.codeHint')}</p>
          </div>
          {error && <p className="type-label text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => join.mutate()} disabled={!code.trim() || join.isPending}>
            {join.isPending ? t('org.joining') : t('org.join')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function OrgSelectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentOrgID, setCurrentOrg, setOrgMemberships, orgMemberships: memberships } = useUserStore()
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)

  const currentMembership = memberships.find((m) => m.org_id === currentOrgID)
  const isCurrentOrgAdmin = currentMembership && !currentMembership.is_personal && ['owner', 'admin'].includes(currentMembership.role)
  const switchableMemberships = memberships

  async function refreshMemberships(preferredOrgId: number) {
    const res = await api.get('/auth/me')
    setOrgMemberships(res.data.org_memberships ?? [], preferredOrgId)
  }

  function selectOrg(orgId: number) {
    setCurrentOrg(orgId)
    setCurrentProject(null)
    queryClient.removeQueries({ queryKey: ['projects'] })
    queryClient.removeQueries({ queryKey: ['progress'] })
    navigate(ROUTES.projects, { replace: true })
  }

  function returnToCurrentWorkspace() {
    navigate(ROUTES.projects, { replace: true })
  }

  async function handleCreated(orgId: number) {
    setShowCreate(false)
    await refreshMemberships(orgId)
    selectOrg(orgId)
  }

  async function handleJoined(orgId: number) {
    setShowJoin(false)
    await refreshMemberships(orgId)
    selectOrg(orgId)
  }

  function scrollToSettings() {
    document.getElementById('workspace-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="w-full max-w-3xl">
        <div className="mb-7">
          {currentOrgID && (
            <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={returnToCurrentWorkspace}>
              <ArrowLeft size={14} className="mr-1.5" />
              {t('common.back')}
            </Button>
          )}
          <h1 className="type-page-title font-bold text-foreground mb-1">{t('org.selectTitle')}</h1>
          <p className="type-body text-muted-foreground">{t('org.selectSubtitle')}</p>
        </div>

        {currentMembership && (
          <section className="mb-7 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  {currentMembership.is_personal ? (
                    <CircleUserRound size={17} className="text-muted-foreground" />
                  ) : (
                    <Building2 size={17} className="text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="type-label font-semibold uppercase tracking-wider text-muted-foreground">{t('org.currentWorkspace')}</p>
                  <p className="type-body font-semibold text-foreground truncate">{currentMembership.org_name}</p>
                  <p className="type-label text-muted-foreground">{roleLabel(currentMembership.role, t)}</p>
                </div>
              </div>
              {isCurrentOrgAdmin && (
                <Button variant="outline" onClick={scrollToSettings}>
                  <Settings size={14} className="mr-2" />
                  {t('org.settingsTitle')}
                </Button>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex min-h-32 flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Plus size={16} className="text-muted-foreground" />
              </div>
              <p className="type-body font-semibold text-foreground">{t('org.createNew')}</p>
            </div>
            <p className="mt-4 type-label leading-5 text-muted-foreground">{t('org.createOptionDescription')}</p>
          </button>

          <button
            onClick={() => setShowJoin(true)}
            className="flex min-h-32 flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <KeyRound size={16} className="text-muted-foreground" />
              </div>
              <p className="type-body font-semibold text-foreground">{t('org.joinWithCode')}</p>
            </div>
            <p className="mt-4 type-label leading-5 text-muted-foreground">{t('org.joinOptionDescription')}</p>
          </button>
        </div>

        {switchableMemberships.length > 0 && (
          <div className="mt-7">
            <p className="mb-3 type-label font-semibold uppercase tracking-wider text-muted-foreground">{t('org.existingWorkspaces')}</p>
            <div className="space-y-2">
              {switchableMemberships.map((m) => (
                <button
                  key={m.org_id}
                  onClick={() => selectOrg(m.org_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left group"
                >
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                    {m.is_personal ? <CircleUserRound size={16} className="text-muted-foreground" /> : <Building2 size={16} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="type-body font-medium text-foreground truncate">{m.org_name}</p>
                    <p className="type-label text-muted-foreground">{roleLabel(m.role, t)}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {isCurrentOrgAdmin && (
          <section id="workspace-settings" className="mt-8 scroll-mt-6">
            <div className="mb-4">
              <h2 className="type-title-sm font-semibold text-foreground">{t('org.settingsTitle')}</h2>
              <p className="type-label text-muted-foreground mt-1">{t('org.settingsSubtitle')}</p>
            </div>
            <OrgSettingsPage embedded />
          </section>
        )}

      {showCreate && (
        <CreateOrgDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {showJoin && (
        <JoinOrgDialog onClose={() => setShowJoin(false)} onJoined={handleJoined} />
      )}
    </div>
  )
}
