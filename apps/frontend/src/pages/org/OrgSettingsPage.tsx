import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Plus, Trash2, UserMinus } from 'lucide-react'
import { useUserStore } from '@/store/userStore'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@movscript/ui'
import { Badge } from '@movscript/ui'
import { translateApiError } from '@/lib/apiError'
import type { OrganizationMember, OrgInvitation } from '@/types'

type Tab = 'members' | 'invitations' | 'settings'

function MembersTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useUserStore((s) => s.currentUser)
  const [showAdd, setShowAdd] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addError, setAddError] = useState('')

  const { data: members = [], isLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['org', orgId, 'members'],
    queryFn: () => api.get(`/orgs/${orgId}/members`).then((r) => r.data),
  })

  const addMember = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/members`, { username: addUsername, role: addRole }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] })
      setShowAdd(false)
      setAddUsername('')
      setAddRole('member')
      setAddError('')
    },
    onError: (e: any) => setAddError(translateApiError(e.response?.data, t('org.addMemberFailed'))),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.patch(`/orgs/${orgId}/members/${userId}`, { role }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => api.delete(`/orgs/${orgId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  })

  const roles = ['owner', 'admin', 'member', 'viewer']

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('org.membersCount', { count: members.length })}</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={13} className="mr-1.5" />
          {t('org.addMember')}
        </Button>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border">
        {members.map((m) => (
          <div key={m.ID} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{m.user?.username ?? `#${m.user_id}`}</p>
            </div>
            <Select
              value={m.role}
              onValueChange={(role) => updateRole.mutate({ userId: m.user_id, role })}
              disabled={m.user_id === currentUser?.ID}
            >
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {t(`org.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={m.user_id === currentUser?.ID}
              onClick={() => removeMember.mutate(m.user_id)}
              title={t('org.removeMember')}
            >
              <UserMinus size={13} />
            </Button>
          </div>
        ))}
      </div>

      {showAdd && (
        <Dialog open onOpenChange={(o) => !o && setShowAdd(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('org.addMember')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="add-username">{t('auth.username')}</Label>
                <Input
                  id="add-username"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder={t('org.usernamePlaceholder')}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>{t('org.role')}</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{t(`org.roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => addMember.mutate()} disabled={!addUsername.trim() || addMember.isPending}>
                {addMember.isPending ? t('common.creating') : t('org.addMember')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function InvitationsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteNote, setInviteNote] = useState('')
  const [createError, setCreateError] = useState('')

  const { data: invitations = [], isLoading } = useQuery<OrgInvitation[]>({
    queryKey: ['org', orgId, 'invitations'],
    queryFn: () => api.get(`/orgs/${orgId}/invitations`).then((r) => r.data),
  })

  const createInvitation = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/invitations`, { role: inviteRole, note: inviteNote }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'invitations'] })
      setShowCreate(false)
      setInviteRole('member')
      setInviteNote('')
      setCreateError('')
    },
    onError: (e: any) => setCreateError(translateApiError(e.response?.data, t('org.createInviteFailed'))),
  })

  const revokeInvitation = useMutation({
    mutationFn: (invId: number) => api.delete(`/orgs/${orgId}/invitations/${invId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'invitations'] }),
  })

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  const roles = ['admin', 'member', 'viewer']

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('org.invitationsCount', { count: invitations.length })}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={13} className="mr-1.5" />
          {t('org.createInvite')}
        </Button>
      </div>

      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{t('org.noInvitations')}</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {invitations.map((inv) => (
            <div key={inv.ID} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-muted-foreground truncate">{inv.token}</p>
                {inv.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{inv.note}</p>}
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{t(`org.roles.${inv.role}`)}</Badge>
              {inv.used_at ? (
                <Badge variant="secondary" className="text-xs shrink-0">{t('org.inviteUsed')}</Badge>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => copyLink(inv.token)}
                    title={t('org.copyInviteLink')}
                  >
                    <Copy size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeInvitation.mutate(inv.ID)}
                    title={t('org.revokeInvite')}
                  >
                    <Trash2 size={13} />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Dialog open onOpenChange={(o) => !o && setShowCreate(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('org.createInvite')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>{t('org.role')}</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{t(`org.roles.${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invite-note">{t('org.inviteNote')}</Label>
                <Input
                  id="invite-note"
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder={t('org.inviteNotePlaceholder')}
                  className="mt-1"
                />
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => createInvitation.mutate()} disabled={createInvitation.isPending}>
                {createInvitation.isPending ? t('common.creating') : t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function SettingsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: org } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
    onSuccess: (data: any) => { if (!name) setName(data.name) },
  } as any)

  const update = useMutation({
    mutationFn: () => api.put(`/orgs/${orgId}`, { name }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError('')
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, t('org.updateFailed'))),
  })

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="org-name-setting">{t('org.name')}</Label>
        <Input
          id="org-name-setting"
          value={name || (org as any)?.name || ''}
          onChange={(e) => setName(e.target.value)}
          className="mt-1"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={() => update.mutate()} disabled={update.isPending || !name.trim()}>
        {saved ? t('org.saved') : update.isPending ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}

export default function OrgSettingsPage() {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [tab, setTab] = useState<Tab>('members')

  if (!currentOrgID) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: t('org.tabs.members') },
    { key: 'invitations', label: t('org.tabs.invitations') },
    { key: 'settings', label: t('org.tabs.settings') },
  ]

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold text-foreground mb-6">{t('org.settingsTitle')}</h1>

      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'members' && <MembersTab orgId={currentOrgID} />}
      {tab === 'invitations' && <InvitationsTab orgId={currentOrgID} />}
      {tab === 'settings' && <SettingsTab orgId={currentOrgID} />}
    </div>
  )
}
