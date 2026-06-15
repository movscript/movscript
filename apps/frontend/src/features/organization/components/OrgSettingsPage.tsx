import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Coins, Copy, Plus, Trash2, UserMinus } from 'lucide-react'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import {
  OrganizationDataTable,
  OrganizationDataTableBody,
  OrganizationDataTableCell,
  OrganizationDataTableEmptyRow,
  OrganizationDataTableHeader,
  OrganizationDataTableHeadCell,
  OrganizationDataTableRow,
  OrganizationInlineError,
  OrganizationJoinCodeCard,
  OrganizationListRow,
  OrganizationListSurface,
  OrganizationStack,
  OrganizationStatusMessage,
  OrganizationTableSurface,
  OrganizationTabButton,
  OrganizationTabs,
  OrganizationToolbar,
  OrganizationUsageCostCard,
  OrganizationUsageMetricCard,
  OrganizationUsageMetricGrid
} from './OrganizationUi'
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui/primitives'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import { invalidateOrganizationMutationResult, organizationChangedResult, organizationInvitationsChangedResult, organizationMembersChangedResult } from '@/features/organization/application/organizationMutationInvalidation'
import { OrgGenerationToolsTab } from '@/features/organization/components/OrgGenerationToolsTab'
import type { Organization, OrganizationMember, OrgInvitation } from '@/types'

type Tab = 'members' | 'usage' | 'invitations' | 'generation-tools' | 'settings'

type OrgUsageRow = {
  user_id: number
  username: string
  cost: number
  tokens: number
}

type OrgUsageResult = {
  month: string
  by_user: OrgUsageRow[]
}

function MembersTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useUserStore((s) => s.currentUser)
  const [showAdd, setShowAdd] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [addError, setAddError] = useState('')

  const { data: members = [], isLoading } = useQuery<OrganizationMember[]>({
    queryKey: organizationKeys.members(orgId),
    queryFn: () => api.get(`/orgs/${orgId}/members`).then((r) => r.data),
  })

  const addMember = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/members`, { username: addUsername, role: addRole }).then((r) => r.data),
    onSuccess: (member) => {
      invalidateOrganizationMutationResult(qc, organizationMembersChangedResult({ orgId, changedIds: [member?.ID ?? member?.id ?? addUsername] }))
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
    onSuccess: (_, { userId }) => invalidateOrganizationMutationResult(qc, organizationMembersChangedResult({ orgId, changedIds: [userId] })),
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => api.delete(`/orgs/${orgId}/members/${userId}`),
    onSuccess: (_, userId) => invalidateOrganizationMutationResult(qc, organizationMembersChangedResult({ orgId, changedIds: [userId] })),
  })

  const roles = ['owner', 'admin', 'member', 'viewer']

  if (isLoading) return <p className="type-body text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <OrganizationStack>
      <OrganizationToolbar>
        <p className="type-body text-muted-foreground">{t('org.membersCount', { count: members.length })}</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('org.addMember')}
        </Button>
      </OrganizationToolbar>

      <OrganizationListSurface>
        {members.map((m) => (
          <OrganizationListRow key={m.ID}>
            <div className="flex-1 min-w-0">
              <p className="type-body font-medium text-foreground truncate">{m.user?.username ?? `#${m.user_id}`}</p>
            </div>
            <Select
              value={m.role}
              onValueChange={(role) => updateRole.mutate({ userId: m.user_id, role })}
              disabled={m.user_id === currentUser?.ID}
            >
              <SelectTrigger className="w-28 h-7 type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="type-label">
                    {t(`org.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              tone="danger"
              className="text-muted-foreground"
              disabled={m.user_id === currentUser?.ID}
              onClick={() => removeMember.mutate(m.user_id)}
              title={t('org.removeMember')}
            >
              <UserMinus size={14} />
            </Button>
          </OrganizationListRow>
        ))}
      </OrganizationListSurface>

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
              {addError && <OrganizationInlineError>{addError}</OrganizationInlineError>}
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
    </OrganizationStack>
  )
}

function InvitationsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteNote, setInviteNote] = useState('')
  const [createError, setCreateError] = useState('')
  const [copied, setCopied] = useState('')

  const { data: org } = useQuery<Organization>({
    queryKey: organizationKeys.detail(orgId),
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
  })

  const { data: invitations = [], isLoading } = useQuery<OrgInvitation[]>({
    queryKey: organizationKeys.invitations(orgId),
    queryFn: () => api.get(`/orgs/${orgId}/invitations`).then((r) => r.data),
  })

  const createInvitation = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/invitations`, { role: inviteRole, note: inviteNote }).then((r) => r.data),
    onSuccess: (invitation) => {
      invalidateOrganizationMutationResult(qc, organizationInvitationsChangedResult({ orgId, changedIds: [invitation?.ID ?? invitation?.id ?? inviteRole] }))
      setShowCreate(false)
      setInviteRole('member')
      setInviteNote('')
      setCreateError('')
    },
    onError: (e: any) => setCreateError(translateApiError(e.response?.data, t('org.createInviteFailed'))),
  })

  const revokeInvitation = useMutation({
    mutationFn: (invId: number) => api.delete(`/orgs/${orgId}/invitations/${invId}`),
    onSuccess: (_, invId) => invalidateOrganizationMutationResult(qc, organizationInvitationsChangedResult({ orgId, changedIds: [invId] })),
  })

  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(`link:${token}`)
      window.setTimeout(() => setCopied(''), 1600)
    }).catch(() => {})
  }

  function copyCode() {
    if (!org?.join_code) return
    navigator.clipboard.writeText(org.join_code).then(() => {
      setCopied('code')
      window.setTimeout(() => setCopied(''), 1600)
    }).catch(() => {})
  }

  const roles = ['admin', 'member', 'viewer']

  if (isLoading) return <p className="type-body text-muted-foreground py-4">{t('common.loading')}</p>

  return (
    <OrganizationStack>
      <OrganizationJoinCodeCard>
        <div className="flex-1 min-w-0">
          <p className="type-body font-medium text-foreground">{t('org.code')}</p>
          <p className="mt-1 font-mono type-body text-foreground">{org?.join_code ?? t('common.loadingShort')}</p>
          <p className="mt-1 type-label text-muted-foreground">{t('org.codeManagementHint')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={copyCode} disabled={!org?.join_code}>
          {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
          {t('org.copyOrgCode')}
        </Button>
      </OrganizationJoinCodeCard>

      <OrganizationToolbar>
        <p className="type-body text-muted-foreground">{t('org.invitationsCount', { count: invitations.length })}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('org.createInvite')}
        </Button>
      </OrganizationToolbar>

      {invitations.length === 0 ? (
        <p className="type-body text-muted-foreground py-4 text-center">{t('org.noInvitations')}</p>
      ) : (
        <OrganizationListSurface>
          {invitations.map((inv) => (
            <OrganizationListRow key={inv.ID}>
              <div className="flex-1 min-w-0">
                <p className="type-label font-mono text-muted-foreground truncate">{inv.token}</p>
                {inv.note && <p className="type-label text-muted-foreground mt-0.5 truncate">{inv.note}</p>}
              </div>
              <Badge variant="outline" className="type-label shrink-0">{t(`org.roles.${inv.role}`)}</Badge>
              {inv.used_at ? (
                <Badge className="type-label shrink-0">{t('org.inviteUsed')}</Badge>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => copyLink(inv.token)}
                    title={t('org.copyInviteLink')}
                  >
                    {copied === `link:${inv.token}` ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    tone="danger"
                    className="text-muted-foreground"
                    onClick={() => revokeInvitation.mutate(inv.ID)}
                    title={t('org.revokeInvite')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </OrganizationListRow>
          ))}
        </OrganizationListSurface>
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
              {createError && <OrganizationInlineError>{createError}</OrganizationInlineError>}
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
    </OrganizationStack>
  )
}

function UsageTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()

  const { data } = useQuery<OrgUsageResult>({
    queryKey: organizationKeys.usage(orgId),
    queryFn: () => api.get(`/orgs/${orgId}/usage`).then((r) => r.data),
  })

  const rows = data?.by_user ?? []
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0)

  return (
    <OrganizationStack>
      <OrganizationUsageMetricGrid>
        <OrganizationUsageMetricCard label={t('org.usage.month')} value={data?.month ?? '—'} />
        <OrganizationUsageMetricCard label={t('org.usage.totalTokens')} value={totalTokens.toLocaleString()} />
      </OrganizationUsageMetricGrid>

      <OrganizationUsageCostCard
        icon={<Coins size={14} />}
        label={t('org.usage.totalCost')}
        value={totalCost.toFixed(3)}
        detail={t('common.credits')}
      />

      <OrganizationTableSurface>
        <OrganizationDataTable>
          <OrganizationDataTableHeader>
            <tr>
              <OrganizationDataTableHeadCell>{t('org.usage.user')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.tokens')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.cost')}</OrganizationDataTableHeadCell>
            </tr>
          </OrganizationDataTableHeader>
          <OrganizationDataTableBody>
            {rows.map((row) => (
              <OrganizationDataTableRow key={row.user_id} interactive>
                <OrganizationDataTableCell>{row.username}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" numeric>{row.tokens.toLocaleString()}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" emphasis="strong" numeric>{row.cost.toFixed(3)}</OrganizationDataTableCell>
              </OrganizationDataTableRow>
            ))}
            {rows.length === 0 && (
              <OrganizationDataTableEmptyRow colSpan={3}>{t('org.usage.empty')}</OrganizationDataTableEmptyRow>
            )}
          </OrganizationDataTableBody>
        </OrganizationDataTable>
      </OrganizationTableSurface>
    </OrganizationStack>
  )
}

function SettingsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: org } = useQuery({
    queryKey: organizationKeys.detail(orgId),
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
    onSuccess: (data: any) => { if (!name) setName(data.name) },
  } as any)

  const update = useMutation({
    mutationFn: () => api.put(`/orgs/${orgId}`, { name }).then((r) => r.data),
    onSuccess: () => {
      invalidateOrganizationMutationResult(qc, organizationChangedResult({ orgId }))
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
      {error && <OrganizationInlineError>{error}</OrganizationInlineError>}
      <Button onClick={() => update.mutate()} disabled={update.isPending || !name.trim()}>
        {saved ? t('org.saved') : update.isPending ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}

export default function OrgSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [tab, setTab] = useState<Tab>('members')

  if (!currentOrgID) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: t('org.tabs.members') },
    { key: 'usage', label: t('org.tabs.usage') },
    { key: 'invitations', label: t('org.tabs.invitations') },
    { key: 'generation-tools', label: '生成工具' },
    { key: 'settings', label: t('org.tabs.settings') },
  ]

  return (
    <div className={embedded ? '' : 'p-6 max-w-3xl'}>
      {!embedded && <h1 className="type-title font-semibold text-foreground mb-6">{t('org.settingsTitle')}</h1>}

      <OrganizationTabs>
        {tabs.map(({ key, label }) => (
          <OrganizationTabButton
            key={key}
            variant={tab === key ? 'solid' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {label}
          </OrganizationTabButton>
        ))}
      </OrganizationTabs>

      {tab === 'members' && <MembersTab orgId={currentOrgID} />}
      {tab === 'usage' && <UsageTab orgId={currentOrgID} />}
      {tab === 'invitations' && <InvitationsTab orgId={currentOrgID} />}
      {tab === 'generation-tools' && <OrgGenerationToolsTab orgId={currentOrgID} />}
      {tab === 'settings' && <SettingsTab orgId={currentOrgID} />}
    </div>
  )
}
