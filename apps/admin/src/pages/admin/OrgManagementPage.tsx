import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Building2, Edit3, PlusCircle, RefreshCcw, RefreshCw, ScrollText, Search, Trash2, UserPlus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { ActiveUserSelect } from '@/components/admin/ActiveUserSelect'
import { api } from '@/lib/api'
import { translateAPIRequestError } from '@/lib/apiError'
import { auditLogsHref, usageLogsHref } from '@/lib/adminLogQueryParams'
import { cn } from '@/lib/utils'
import type { OrgInvitation, Organization, OrganizationMember, PaginatedResponse } from '@/types'

const PAGE_SIZE = 50

type OrgFilters = {
  query: string
  plan: string
  status: string
  isPersonal: string
}

interface AdminOrgDetail {
  org: Organization
  active_invitations: number
  project_count: number
  resource_count: number
  projects: Array<{
    ID: number
    name: string
    status: string
    owner_id: number
    UpdatedAt: string
  }>
  usage: {
    calls: number
    cost: number
    input_tokens: number
    output_tokens: number
    images: number
    duration_sec: number
  }
  audit: {
    records: number
    last_action?: string
    last_at?: string
  }
}

const emptyFilters: OrgFilters = {
  query: '',
  plan: '',
  status: '',
  isPersonal: '',
}

function formatDate(value: string, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function invitationStatus(invitation: OrgInvitation): 'used' | 'expired' | 'active' {
  if (invitation.used_at) return 'used'
  if (new Date(invitation.expires_at).getTime() < Date.now()) return 'expired'
  return 'active'
}

function formatNumber(value: number | undefined): string {
  return (value ?? 0).toLocaleString()
}

function formatCredits(value: number | undefined): string {
  return (value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function OrgManagementPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<OrgFilters>(emptyFilters)
  const [error, setError] = useState('')
  const [memberDialog, setMemberDialog] = useState<Organization | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createSlug, setCreateSlug] = useState('')
  const [createOwnerUserId, setCreateOwnerUserId] = useState('')
  const [renameOrg, setRenameOrg] = useState<Organization | null>(null)
  const [renameName, setRenameName] = useState('')
  const [addMemberUserId, setAddMemberUserId] = useState('')
  const [addMemberRole, setAddMemberRole] = useState('member')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteNote, setInviteNote] = useState('')

  const params = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    q: filters.query.trim() || undefined,
    plan: filters.plan || undefined,
    status: filters.status || undefined,
    is_personal: filters.isPersonal || undefined,
  }), [filters, page])

  const orgsQuery = useQuery<PaginatedResponse<Organization>>({
    queryKey: ['admin', 'orgs', params],
    queryFn: () => api.get('/admin/orgs', { params }).then((r) => r.data),
  })
  const membersQuery = useQuery<OrganizationMember[]>({
    queryKey: ['admin', 'orgs', memberDialog?.ID, 'members'],
    queryFn: () => api.get(`/admin/orgs/${memberDialog?.ID}/members`).then((r) => r.data),
    enabled: !!memberDialog,
  })
  const invitationsQuery = useQuery<OrgInvitation[]>({
    queryKey: ['admin', 'orgs', memberDialog?.ID, 'invitations'],
    queryFn: () => api.get(`/admin/orgs/${memberDialog?.ID}/invitations`).then((r) => r.data),
    enabled: !!memberDialog,
  })
  const orgDetailQuery = useQuery<AdminOrgDetail>({
    queryKey: ['admin', 'orgs', memberDialog?.ID, 'detail'],
    queryFn: () => api.get(`/admin/orgs/${memberDialog?.ID}/detail`).then((r) => r.data),
    enabled: !!memberDialog,
  })

  const updateOrg = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Pick<Organization, 'name' | 'plan' | 'status'>> }) =>
      api.patch(`/admin/orgs/${id}`, patch).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setError('')
      setRenameOrg(null)
      setRenameName('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.id, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const createOrg = useMutation({
    mutationFn: ({ name, slug, ownerUserId }: { name: string; slug: string; ownerUserId: number }) =>
      api.post('/admin/orgs', { name, slug: slug || undefined, owner_user_id: ownerUserId }).then((r) => r.data),
    onSuccess: () => {
      setError('')
      setCreateDialogOpen(false)
      setCreateName('')
      setCreateSlug('')
      setCreateOwnerUserId('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const rotateJoinCode = useMutation({
    mutationFn: (orgId: number) =>
      api.post(`/admin/orgs/${orgId}/join-code/rotate`).then((r) => r.data),
    onSuccess: (_result, orgId) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const revokeInvitation = useMutation({
    mutationFn: ({ orgId, invitationId }: { orgId: number; invitationId: number }) =>
      api.delete(`/admin/orgs/${orgId}/invitations/${invitationId}`),
    onSuccess: (_result, variables) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'invitations'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const createInvitation = useMutation({
    mutationFn: ({ orgId, role, note }: { orgId: number; role: string; note: string }) =>
      api.post(`/admin/orgs/${orgId}/invitations`, { role, note }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setError('')
      setInviteRole('member')
      setInviteNote('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'invitations'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const updateMember = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: number; userId: number; role: string }) =>
      api.patch(`/admin/orgs/${orgId}/members/${userId}`, { role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const addMember = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: number; userId: number; role: string }) =>
      api.post(`/admin/orgs/${orgId}/members`, { user_id: userId, role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setError('')
      setAddMemberUserId('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const removeMember = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: number; userId: number }) =>
      api.delete(`/admin/orgs/${orgId}/members/${userId}`),
    onSuccess: (_result, variables) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'orgs', variables.orgId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })

  const items = orgsQuery.data?.items ?? []
  const total = orgsQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Object.values(filters).some((value) => value.trim() !== '')
  const queryError = orgsQuery.error

  function updateFilter<K extends keyof OrgFilters>(key: K, value: OrgFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setPage(1)
  }

  function patchOrg(org: Organization, patch: Partial<Pick<Organization, 'name' | 'plan' | 'status'>>) {
    updateOrg.mutate({ id: org.ID, patch })
  }

  function openRenameDialog(org: Organization) {
    setRenameOrg(org)
    setRenameName(org.name)
  }

  function openMemberDialog(org: Organization) {
    setMemberDialog(org)
    setAddMemberUserId('')
    setAddMemberRole('member')
    setInviteRole('member')
    setInviteNote('')
  }

  function submitCreateOrg() {
    const ownerUserId = Number(createOwnerUserId)
    if (!createName.trim() || !Number.isFinite(ownerUserId) || ownerUserId <= 0) return
    createOrg.mutate({ name: createName, slug: createSlug, ownerUserId })
  }

  function submitAddMember() {
    if (!memberDialog) return
    const userId = Number(addMemberUserId)
    if (!Number.isFinite(userId) || userId <= 0) return
    addMember.mutate({ orgId: memberDialog.ID, userId, role: addMemberRole })
  }

  function submitCreateInvitation() {
    if (!memberDialog) return
    if (memberDialog.status === 'suspended') return
    createInvitation.mutate({ orgId: memberDialog.ID, role: inviteRole, note: inviteNote })
  }

  function submitRenameOrg() {
    if (!renameOrg || !renameName.trim()) return
    patchOrg(renameOrg, { name: renameName })
  }

  function confirmRotateJoinCode(org: Organization) {
    if (window.confirm(t('admin.orgs.confirmRotateJoinCode', { name: org.name }))) {
      rotateJoinCode.mutate(org.ID)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Building2 size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('admin.orgs.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.orgs.description', { total })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => setCreateDialogOpen(true)}>
            <PlusCircle size={14} className="mr-2" />
            {t('admin.orgs.create')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => orgsQuery.refetch()} disabled={orgsQuery.isFetching}>
            <RefreshCw size={14} className={cn('mr-2', orgsQuery.isFetching && 'animate-spin')} />
            {t('admin.orgs.refresh')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_160px_auto]">
          <FilterField label={t('admin.orgs.search')} value={filters.query} onChange={(value) => updateFilter('query', value)} placeholder={t('admin.orgs.searchPlaceholder')} />
          <SelectField label={t('admin.orgs.plan')} value={filters.plan} onChange={(value) => updateFilter('plan', value)}>
            <option value="">{t('admin.orgs.allPlans')}</option>
            <option value="personal">{t('admin.orgs.plans.personal')}</option>
            <option value="team">{t('admin.orgs.plans.team')}</option>
          </SelectField>
          <SelectField label={t('admin.orgs.status')} value={filters.status} onChange={(value) => updateFilter('status', value)}>
            <option value="">{t('admin.orgs.allStatuses')}</option>
            <option value="active">{t('admin.orgs.statuses.active')}</option>
            <option value="suspended">{t('admin.orgs.statuses.suspended')}</option>
          </SelectField>
          <SelectField label={t('admin.orgs.kind')} value={filters.isPersonal} onChange={(value) => updateFilter('isPersonal', value)}>
            <option value="">{t('admin.orgs.allKinds')}</option>
            <option value="true">{t('admin.orgs.kinds.personal')}</option>
            <option value="false">{t('admin.orgs.kinds.team')}</option>
          </SelectField>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters} className="self-end">
            <X size={14} className="mr-2" />
            {t('admin.orgs.clear')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {queryError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(queryError)}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.org')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.kind')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.plan')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.status')}</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.orgs.members')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.updatedAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((org) => (
              <tr key={org.ID} className="hover:bg-card/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-foreground">{org.name}</div>
                    <button
                      type="button"
                      onClick={() => openRenameDialog(org)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={t('admin.orgs.rename')}
                      aria-label={t('admin.orgs.rename')}
                    >
                      <Edit3 size={12} />
                    </button>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">#{org.ID} · {org.slug}</div>
                  {org.join_code && (
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <span>{t('admin.orgs.joinCode')}: {org.join_code}</span>
                      {!org.is_personal && (
                        <button
                          type="button"
                          onClick={() => confirmRotateJoinCode(org)}
                          disabled={rotateJoinCode.isPending}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title={t('admin.orgs.rotateJoinCode')}
                          aria-label={t('admin.orgs.rotateJoinCode')}
                        >
                          <RefreshCcw size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {org.is_personal ? t('admin.orgs.kinds.personal') : t('admin.orgs.kinds.team')}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={org.plan || 'team'}
                    onChange={(event) => patchOrg(org, { plan: event.target.value })}
                    disabled={updateOrg.isPending}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="personal">{t('admin.orgs.plans.personal')}</option>
                    <option value="team">{t('admin.orgs.plans.team')}</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={org.status || 'active'}
                    onChange={(event) => patchOrg(org, { status: event.target.value })}
                    disabled={updateOrg.isPending}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="active">{t('admin.orgs.statuses.active')}</option>
                    <option value="suspended">{t('admin.orgs.statuses.suspended')}</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openMemberDialog(org)}
                    className="font-mono text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {(org.member_count ?? 0).toLocaleString()}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(org.UpdatedAt, i18n.language)}</td>
              </tr>
            ))}
            {!orgsQuery.isLoading && !orgsQuery.error && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Search size={18} className="mx-auto mb-2 opacity-60" />
                  {t('admin.orgs.empty')}
                </td>
              </tr>
            )}
            {orgsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{t('admin.orgs.pageStatus', { page, pageCount })}</span>
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          {t('admin.orgs.previousPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
          {t('admin.orgs.nextPage')}
        </Button>
      </div>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.orgs.createTitle')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.orgs.createDescription')}</p>
              </div>
              <button type="button" onClick={() => setCreateDialogOpen(false)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <FilterField label={t('admin.orgs.name')} value={createName} onChange={setCreateName} placeholder={t('admin.orgs.namePlaceholder')} />
              <ActiveUserSelect
                label={t('admin.orgs.ownerUserId')}
                value={createOwnerUserId}
                onChange={setCreateOwnerUserId}
                placeholder={t('admin.orgs.selectOwnerUser')}
                emptyLabel={t('admin.orgs.noUserCandidates')}
              />
              <FilterField label={t('admin.orgs.slug')} value={createSlug} onChange={setCreateSlug} placeholder={t('admin.orgs.slugPlaceholder')} />
              <p className="text-xs text-muted-foreground">{t('admin.orgs.createHint')}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreateDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" onClick={submitCreateOrg} disabled={createOrg.isPending || !createName.trim() || !createOwnerUserId}>
                {createOrg.isPending ? t('admin.orgs.creating') : t('admin.orgs.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {renameOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.orgs.renameTitle')}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{renameOrg.ID} · {renameOrg.slug}</p>
              </div>
              <button type="button" onClick={() => setRenameOrg(null)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <FilterField label={t('admin.orgs.name')} value={renameName} onChange={setRenameName} placeholder={t('admin.orgs.namePlaceholder')} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenameOrg(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" onClick={submitRenameOrg} disabled={updateOrg.isPending || !renameName.trim()}>
                {updateOrg.isPending ? t('admin.orgs.saving') : t('admin.orgs.saveName')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {memberDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.orgs.membersTitle', { name: memberDialog.name })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{memberDialog.ID} · {memberDialog.slug}</p>
              </div>
              <button type="button" onClick={() => setMemberDialog(null)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-5">
              {orgDetailQuery.error && (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {translateAPIRequestError(orgDetailQuery.error)}
                </div>
              )}
              {orgDetailQuery.isLoading && (
                <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {orgDetailQuery.data && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailMetric label={t('admin.orgs.detailMembers')} value={formatNumber(orgDetailQuery.data.org.member_count)} />
                  <DetailMetric label={t('admin.orgs.detailProjects')} value={formatNumber(orgDetailQuery.data.project_count)} detail={t('admin.orgs.detailResources', { count: formatNumber(orgDetailQuery.data.resource_count) })} />
                  <DetailMetric label={t('admin.orgs.detailUsageCost')} value={formatCredits(orgDetailQuery.data.usage.cost)} detail={t('admin.orgs.detailUsageCalls', { count: formatNumber(orgDetailQuery.data.usage.calls) })} />
	                  <DetailMetric
	                    label={t('admin.orgs.detailAuditRecords')}
	                    value={formatNumber(orgDetailQuery.data.audit.records)}
	                    detail={orgDetailQuery.data.audit.last_action ? `${orgDetailQuery.data.audit.last_action} · ${formatDate(orgDetailQuery.data.audit.last_at ?? '', i18n.language)}` : undefined}
	                  />
	                </div>
	              )}
	              <div className="mb-4 flex flex-wrap gap-2">
	                <Button asChild type="button" variant="outline" size="sm">
	                  <Link to={usageLogsHref({ orgId: memberDialog.ID })}>
	                    <BarChart3 size={14} className="mr-2" />
	                    {t('admin.orgs.viewUsageLogs')}
	                  </Link>
	                </Button>
	                <Button asChild type="button" variant="outline" size="sm">
	                  <Link to={auditLogsHref({ orgId: memberDialog.ID })}>
	                    <ScrollText size={14} className="mr-2" />
	                    {t('admin.orgs.viewAuditLogs')}
	                  </Link>
	                </Button>
	              </div>
	              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <DetailSection title={t('admin.orgs.members')}>
                <div className="grid gap-2 border-b border-border bg-card/40 p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <ActiveUserSelect
                    value={addMemberUserId}
                    onChange={setAddMemberUserId}
                    placeholder={t('admin.orgs.selectMemberUser')}
                    emptyLabel={t('admin.orgs.noUserCandidates')}
                  />
                  <select
                    value={addMemberRole}
                    onChange={(event) => setAddMemberRole(event.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {['owner', 'admin', 'member', 'viewer'].map((role) => (
                      <option key={role} value={role}>{t(`admin.orgs.memberRoles.${role}`, { defaultValue: role })}</option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={submitAddMember} disabled={addMember.isPending || !addMemberUserId}>
                    <UserPlus size={14} className="mr-2" />
                    {addMember.isPending ? t('admin.orgs.addingMember') : t('admin.orgs.addMember')}
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-card">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.member')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.role')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.orgs.joinedAt')}</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {membersQuery.error && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-xs text-destructive">
                          {translateAPIRequestError(membersQuery.error)}
                        </td>
                      </tr>
                    )}
                    {(membersQuery.data ?? []).map((member) => (
                      <tr key={member.ID}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{member.user?.display_name || member.user?.username || `#${member.user_id}`}</div>
                          <div className="font-mono text-xs text-muted-foreground">#{member.user_id}{member.user?.primary_email ? ` · ${member.user.primary_email}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={member.role}
                            onChange={(event) => updateMember.mutate({ orgId: memberDialog.ID, userId: member.user_id, role: event.target.value })}
                            disabled={updateMember.isPending}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {['owner', 'admin', 'member', 'viewer'].map((role) => (
                              <option key={role} value={role}>{t(`admin.orgs.memberRoles.${role}`, { defaultValue: role })}</option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(member.CreatedAt, i18n.language)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('admin.orgs.confirmRemoveMember'))) {
                                removeMember.mutate({ orgId: memberDialog.ID, userId: member.user_id })
                              }
                            }}
                            disabled={removeMember.isPending}
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                            title={t('admin.orgs.removeMember')}
                            aria-label={t('admin.orgs.removeMember')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!membersQuery.isLoading && !membersQuery.error && (membersQuery.data ?? []).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.orgs.noMembers')}</td></tr>
                    )}
                    {membersQuery.isLoading && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td></tr>
                    )}
                  </tbody>
                </table>
              </DetailSection>

              <DetailSection title={t('admin.orgs.invitations')}>
                {memberDialog.status === 'suspended' && (
                  <div className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-700">
                    {t('admin.orgs.suspendedInvitationHint')}
                  </div>
                )}
                <div className="grid gap-2 border-b border-border bg-card/40 p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {['admin', 'member', 'viewer'].map((role) => (
                      <option key={role} value={role}>{t(`admin.orgs.memberRoles.${role}`, { defaultValue: role })}</option>
                    ))}
                  </select>
                  <Input
                    value={inviteNote}
                    onChange={(event) => setInviteNote(event.target.value)}
                    placeholder={t('admin.orgs.invitationNotePlaceholder')}
                    className="h-8 text-xs"
                  />
                  <Button type="button" size="sm" onClick={submitCreateInvitation} disabled={createInvitation.isPending || memberDialog.status === 'suspended'}>
                    {createInvitation.isPending ? t('admin.orgs.creatingInvitation') : t('admin.orgs.createInvitation')}
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {invitationsQuery.error && (
                    <div className="px-4 py-3 text-xs text-destructive">
                      {translateAPIRequestError(invitationsQuery.error)}
                    </div>
                  )}
                  {(invitationsQuery.data ?? []).map((invitation) => {
                    const status = invitationStatus(invitation)
                    return (
                      <div key={invitation.ID} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">#{invitation.ID}</span>
                              <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px]',
                                status === 'active' ? 'bg-primary/10 text-primary' : status === 'expired' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
                              )}>
                                {t(`admin.orgs.invitationStatuses.${status}`)}
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-xs text-foreground break-all">{invitation.token}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t('admin.orgs.role')}: {t(`admin.orgs.memberRoles.${invitation.role}`, { defaultValue: invitation.role })}
                            </div>
                          </div>
                          {status === 'active' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(t('admin.orgs.confirmRevokeInvitation'))) {
                                  revokeInvitation.mutate({ orgId: memberDialog.ID, invitationId: invitation.ID })
                                }
                              }}
                              disabled={revokeInvitation.isPending}
                              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                              title={t('admin.orgs.revokeInvitation')}
                              aria-label={t('admin.orgs.revokeInvitation')}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div>{t('admin.orgs.createdAt')}: {formatDate(invitation.CreatedAt, i18n.language)}</div>
                          <div>{t('admin.orgs.expiresAt')}: {formatDate(invitation.expires_at, i18n.language)}</div>
                          {invitation.used_by && <div>{t('admin.orgs.usedBy')}: #{invitation.used_by}</div>}
                          {invitation.note && <div>{t('admin.orgs.note')}: {invitation.note}</div>}
                        </div>
                      </div>
                    )
                  })}
                  {!invitationsQuery.isLoading && !invitationsQuery.error && (invitationsQuery.data ?? []).length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.orgs.noInvitations')}</div>
                  )}
                  {invitationsQuery.isLoading && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
                  )}
                </div>
              </DetailSection>

              <DetailSection title={t('admin.orgs.recentProjects')}>
                <div className="divide-y divide-border">
                  {(orgDetailQuery.data?.projects ?? []).map((project) => (
                    <div key={project.ID} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{project.name}</div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">#{project.ID} · {t('admin.orgs.owner')}: #{project.owner_id}</div>
                        </div>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{project.status || '-'}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{t('admin.orgs.updatedAt')}: {formatDate(project.UpdatedAt, i18n.language)}</div>
                    </div>
                  ))}
                  {!orgDetailQuery.isLoading && !orgDetailQuery.error && (orgDetailQuery.data?.projects ?? []).length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.orgs.noRecentProjects')}</div>
                  )}
                </div>
              </DetailSection>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
        {children}
      </select>
    </div>
  )
}

function DetailMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}
