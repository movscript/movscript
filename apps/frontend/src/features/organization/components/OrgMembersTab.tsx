import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, UserMinus } from 'lucide-react'

import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { api } from '@/shared/infrastructure/api'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import {
  invalidateOrganizationMutationResult,
  organizationMembersChangedResult,
} from '@/features/organization/application/organizationMutationInvalidation'
import {
  OrganizationInlineError,
  OrganizationListRow,
  OrganizationListSurface,
  OrganizationStack,
  OrganizationToolbar,
} from './OrganizationUi'
import { ORG_MEMBER_ROLES } from './OrgSettingsTabsModel'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui/primitives'
import type { OrganizationMember } from '@/types'

export function MembersTab({ orgId }: { orgId: number }) {
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
                {ORG_MEMBER_ROLES.map((r) => (
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
                    {ORG_MEMBER_ROLES.map((r) => (
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
