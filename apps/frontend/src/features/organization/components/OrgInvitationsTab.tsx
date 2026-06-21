import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'

import { api } from '@/shared/infrastructure/api'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import {
  invalidateOrganizationMutationResult,
  organizationInvitationsChangedResult,
} from '@/features/organization/application/organizationMutationInvalidation'
import {
  OrganizationInlineError,
  OrganizationJoinCodeCard,
  OrganizationListRow,
  OrganizationListSurface,
  OrganizationStack,
  OrganizationToolbar,
} from './OrganizationUi'
import { ORG_INVITATION_ROLES } from './OrgSettingsTabsModel'
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui/primitives'
import type { Organization, OrgInvitation } from '@/types'

export function InvitationsTab({ orgId }: { orgId: number }) {
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
                    {ORG_INVITATION_ROLES.map((r) => (
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
