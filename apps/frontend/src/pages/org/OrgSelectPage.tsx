import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building2, User, Plus, ChevronRight } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@movscript/ui'
import { translateApiError } from '@/lib/apiError'
import type { OrgMembership } from '@/types'

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
            <p className="text-xs text-muted-foreground mt-1">{t('org.slugHint')}</p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
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

export default function OrgSelectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { orgMemberships, setCurrentOrg, orgMemberships: memberships } = useUserStore()
  const [showCreate, setShowCreate] = useState(false)

  function selectOrg(orgId: number) {
    setCurrentOrg(orgId)
    navigate('/projects', { replace: true })
  }

  function handleCreated(orgId: number) {
    setShowCreate(false)
    selectOrg(orgId)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-foreground mb-1">{t('org.selectTitle')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t('org.selectSubtitle')}</p>

        <div className="space-y-2">
          {memberships.map((m) => (
            <button
              key={m.org_id}
              onClick={() => selectOrg(m.org_id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                {m.is_personal
                  ? <User size={16} className="text-muted-foreground" />
                  : <Building2 size={16} className="text-muted-foreground" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.org_name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel(m.role, t)}</p>
              </div>
              <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <Plus size={14} />
          {t('org.createNew')}
        </button>
      </div>

      {showCreate && (
        <CreateOrgDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
