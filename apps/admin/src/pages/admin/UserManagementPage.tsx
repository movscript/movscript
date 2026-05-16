import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Pencil, Plus, RefreshCw, ScrollText, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { translateAPIRequestError } from '@/lib/apiError'
import { auditLogsHref, usageLogsHref } from '@/lib/adminLogQueryParams'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import type { PaginatedResponse, User } from '@/types'

const PAGE_SIZE = 50

type UserFilters = {
  query: string
  systemRole: string
  status: string
}

type CreateUserForm = {
  username: string
  password: string
  email: string
  displayName: string
  systemRole: User['system_role']
  status: string
}

interface AdminUserDetail {
  user: User
  orgs: Array<{
    ID: number
    name: string
    slug: string
    plan: string
    status: string
    role: string
    joined_at: string
  }>
  projects: Array<{
    ID: number
    name: string
    status: string
    org_id?: number
    owner_id: number
    role: string
    joined_at: string
  }>
  sessions: Array<{
    ID: number
    expires_at: string
    revoked_at?: string
    last_seen_at?: string
    user_agent?: string
    ip_address?: string
    CreatedAt: string
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

const emptyFilters: UserFilters = {
  query: '',
  systemRole: '',
  status: '',
}

const emptyCreateUserForm: CreateUserForm = {
  username: '',
  password: '',
  email: '',
  displayName: '',
  systemRole: 'user',
  status: 'active',
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function userDisplayName(user: User): string {
  return user.display_name?.trim() || user.username || `#${user.ID}`
}

function formatNumber(value: number | undefined): string {
  return (value ?? 0).toLocaleString()
}

function formatCredits(value: number | undefined): string {
  return (value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function UserManagementPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const currentUser = useUserStore((state) => state.currentUser)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<UserFilters>(emptyFilters)
  const [error, setError] = useState('')
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateUserForm)
  const [resetPassword, setResetPassword] = useState('')

  const params = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    q: filters.query.trim() || undefined,
    system_role: filters.systemRole || undefined,
    status: filters.status || undefined,
  }), [filters, page])

  const usersQuery = useQuery<PaginatedResponse<User>>({
    queryKey: ['admin', 'users', params],
    queryFn: () => api.get('/admin/users', { params }).then((r) => r.data),
  })
  const userDetailQuery = useQuery<AdminUserDetail>({
    queryKey: ['admin', 'users', detailUser?.ID, 'detail'],
    queryFn: () => api.get(`/admin/users/${detailUser?.ID}/detail`).then((r) => r.data),
    enabled: !!detailUser,
  })

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/admin/users/${id}`, patch).then((r) => r.data),
    onSuccess: (updated: User, variables) => {
      setError('')
      setEditUser(null)
      setEditDisplayName('')
      setEditEmail('')
      if (detailUser?.ID === updated.ID) {
        setDetailUser(updated)
      }
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users', variables.id, 'detail'] })
    },
    onError: (err: any) => {
      setError(translateAPIRequestError(err))
    },
  })
  const createUser = useMutation({
    mutationFn: (form: CreateUserForm) => api.post('/admin/users', {
      username: form.username.trim(),
      password: form.password,
      email: form.email.trim() || undefined,
      display_name: form.displayName.trim() || undefined,
      system_role: form.systemRole,
      status: form.status,
    }).then((r) => r.data as User),
    onSuccess: () => {
      setError('')
      setShowCreate(false)
      setCreateForm(emptyCreateUserForm)
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.put(`/admin/users/${id}/password`, { password }).then((r) => r.data as User),
    onSuccess: (_result, variables) => {
      setError('')
      setResetPassword('')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users', variables.id, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const revokeSession = useMutation({
    mutationFn: ({ userId, sessionId }: { userId: number; sessionId: number }) =>
      api.delete(`/admin/users/${userId}/sessions/${sessionId}`),
    onSuccess: (_result, variables) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'users', variables.userId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })
  const revokeAllSessions = useMutation({
    mutationFn: (userId: number) => api.delete(`/admin/users/${userId}/sessions`),
    onSuccess: (_result, userId) => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin', 'users', userId, 'detail'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })

  const items = usersQuery.data?.items ?? []
  const total = usersQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Object.values(filters).some((value) => value.trim() !== '')
  const queryError = usersQuery.error

  function updateFilter<K extends keyof UserFilters>(key: K, value: UserFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setPage(1)
  }

  function patchUser(user: User, patch: Record<string, unknown>) {
    if (!confirmUserPatch(user, patch)) return
    updateUser.mutate({ id: user.ID, patch })
  }

  function confirmUserPatch(user: User, patch: Record<string, unknown>) {
    const role = typeof patch.system_role === 'string' ? patch.system_role : undefined
    const status = typeof patch.status === 'string' ? patch.status : undefined
    const demotesSuperAdmin = user.system_role === 'super_admin' && role !== undefined && role !== 'super_admin'
    const disablesUser = status !== undefined && status !== (user.status || 'active') && status !== 'active'
    if (user.ID === currentUser?.ID && (demotesSuperAdmin || disablesUser)) {
      return window.confirm(t('admin.users.confirmOwnAccessChange'))
    }
    if (role !== undefined && role !== user.system_role) {
      return window.confirm(t('admin.users.confirmRoleChange', {
        name: userDisplayName(user),
        role: t(`admin.users.roles.${role}`, { defaultValue: role }),
      }))
    }
    if (status !== undefined && status !== (user.status || 'active')) {
      return window.confirm(t('admin.users.confirmStatusChange', {
        name: userDisplayName(user),
        status: t(`admin.users.statuses.${status}`, { defaultValue: status }),
      }))
    }
    return true
  }

  function openEditUser(user: User) {
    setEditUser(user)
    setEditDisplayName(user.display_name || '')
    setEditEmail(user.primary_email || '')
  }

  function submitEditUser() {
    if (!editUser) return
    patchUser(editUser, {
      display_name: editDisplayName,
      email: editEmail,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UsersRound size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('admin.users.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.users.description', { total })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-2" />
            {t('admin.users.create')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
            <RefreshCw size={14} className={cn('mr-2', usersQuery.isFetching && 'animate-spin')} />
            {t('admin.users.refresh')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <FilterField
            label={t('admin.users.search')}
            value={filters.query}
            onChange={(value) => updateFilter('query', value)}
            placeholder={t('admin.users.searchPlaceholder')}
          />
          <SelectField label={t('admin.users.role')} value={filters.systemRole} onChange={(value) => updateFilter('systemRole', value)}>
            <option value="">{t('admin.users.allRoles')}</option>
            <option value="super_admin">{t('admin.users.roles.super_admin')}</option>
            <option value="user">{t('admin.users.roles.user')}</option>
          </SelectField>
          <SelectField label={t('admin.users.status')} value={filters.status} onChange={(value) => updateFilter('status', value)}>
            <option value="">{t('admin.users.allStatuses')}</option>
            <option value="active">{t('admin.users.statuses.active')}</option>
            <option value="disabled">{t('admin.users.statuses.disabled')}</option>
            <option value="suspended">{t('admin.users.statuses.suspended')}</option>
          </SelectField>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters} className="self-end">
            <X size={14} className="mr-2" />
            {t('admin.users.clear')}
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

      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('admin.users.createTitle')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.users.createHint')}</p>
            </div>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FilterField label={t('admin.users.username')} value={createForm.username} onChange={(value) => setCreateForm((form) => ({ ...form, username: value }))} />
            <FilterField label={t('admin.users.password')} type="password" value={createForm.password} onChange={(value) => setCreateForm((form) => ({ ...form, password: value }))} />
            <FilterField label={t('admin.users.displayName')} value={createForm.displayName} onChange={(value) => setCreateForm((form) => ({ ...form, displayName: value }))} />
            <FilterField label={t('admin.users.email')} value={createForm.email} onChange={(value) => setCreateForm((form) => ({ ...form, email: value }))} />
            <SelectField label={t('admin.users.role')} value={createForm.systemRole} onChange={(value) => setCreateForm((form) => ({ ...form, systemRole: value as User['system_role'] }))}>
              <option value="user">{t('admin.users.roles.user')}</option>
              <option value="super_admin">{t('admin.users.roles.super_admin')}</option>
            </SelectField>
            <SelectField label={t('admin.users.status')} value={createForm.status} onChange={(value) => setCreateForm((form) => ({ ...form, status: value }))}>
              <option value="active">{t('admin.users.statuses.active')}</option>
              <option value="disabled">{t('admin.users.statuses.disabled')}</option>
              <option value="suspended">{t('admin.users.statuses.suspended')}</option>
            </SelectField>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button
              type="button"
              size="sm"
              onClick={() => createUser.mutate(createForm)}
              disabled={createUser.isPending || !createForm.username.trim() || createForm.password.length < 8}
            >
              {createUser.isPending ? t('common.saving') : t('admin.users.create')}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.users.user')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.users.contact')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.users.role')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.users.status')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.users.updatedAt')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((user) => (
              <tr key={user.ID} className="hover:bg-card/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                      {userDisplayName(user).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{userDisplayName(user)}</div>
                      <div className="font-mono text-xs text-muted-foreground">#{user.ID} · {user.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <div>{user.primary_email || '-'}</div>
                  <div>{user.primary_phone || '-'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.system_role === 'super_admin' && <ShieldCheck size={14} className="text-primary" />}
                    <select
                      value={user.system_role}
                      onChange={(event) => patchUser(user, { system_role: event.target.value as User['system_role'] })}
                      disabled={updateUser.isPending}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="super_admin">{t('admin.users.roles.super_admin')}</option>
                      <option value="user">{t('admin.users.roles.user')}</option>
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.status || 'active'}
                    onChange={(event) => patchUser(user, { status: event.target.value })}
                    disabled={updateUser.isPending}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="active">{t('admin.users.statuses.active')}</option>
                    <option value="disabled">{t('admin.users.statuses.disabled')}</option>
                    <option value="suspended">{t('admin.users.statuses.suspended')}</option>
                  </select>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(user.UpdatedAt, i18n.language)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => openEditUser(user)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={t('admin.users.edit')}
                      aria-label={t('admin.users.edit')}
                    >
                      <Pencil size={13} />
                    </button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDetailUser(user)}>
                      {t('admin.users.details')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!usersQuery.isLoading && !usersQuery.error && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Search size={18} className="mx-auto mb-2 opacity-60" />
                  {t('admin.users.empty')}
                </td>
              </tr>
            )}
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.users.detailsTitle', { name: userDisplayName(detailUser) })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{detailUser.ID} · {detailUser.username}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-auto p-5">
              {userDetailQuery.isLoading && <div className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</div>}
              {userDetailQuery.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {translateAPIRequestError(userDetailQuery.error)}
                </div>
              )}
              {userDetailQuery.data && (
                <div className="space-y-5">
	                  <div className="grid gap-3 md:grid-cols-4">
	                    <DetailMetric label={t('admin.users.usageCalls')} value={formatNumber(userDetailQuery.data.usage.calls)} />
	                    <DetailMetric label={t('admin.users.usageCost')} value={formatCredits(userDetailQuery.data.usage.cost)} detail="credits" />
                    <DetailMetric label={t('admin.users.auditRecords')} value={formatNumber(userDetailQuery.data.audit.records)} />
                    <DetailMetric
                      label={t('admin.users.lastAudit')}
                      value={userDetailQuery.data.audit.last_action || '-'}
	                      detail={formatDate(userDetailQuery.data.audit.last_at, i18n.language)}
	                    />
	                  </div>
	                  <div className="flex flex-wrap gap-2">
	                    <Button asChild type="button" variant="outline" size="sm">
	                      <Link to={usageLogsHref({ userId: detailUser.ID })}>
	                        <BarChart3 size={14} className="mr-2" />
	                        {t('admin.users.viewUsageLogs')}
	                      </Link>
	                    </Button>
	                    <Button asChild type="button" variant="outline" size="sm">
	                      <Link to={auditLogsHref({ actorId: detailUser.ID })}>
	                        <ScrollText size={14} className="mr-2" />
	                        {t('admin.users.viewAuditLogs')}
	                      </Link>
	                    </Button>
	                  </div>

	                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">{t('admin.users.resetPassword')}</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="password"
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        placeholder={t('admin.users.newPassword')}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(t('admin.users.confirmResetPassword', { name: userDisplayName(detailUser) }))) {
                            resetPasswordMutation.mutate({ id: detailUser.ID, password: resetPassword })
                          }
                        }}
                        disabled={resetPasswordMutation.isPending || resetPassword.length < 8}
                      >
                        {resetPasswordMutation.isPending ? t('common.saving') : t('admin.users.resetPassword')}
                      </Button>
                    </div>
                  </div>

                  <DetailSection
                    title={t('admin.users.sessions')}
                    action={userDetailQuery.data.sessions.some((session) => !session.revoked_at) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(t('admin.users.confirmRevokeAllSessions'))) {
                            revokeAllSessions.mutate(detailUser.ID)
                          }
                        }}
                        disabled={revokeAllSessions.isPending}
                      >
                        {revokeAllSessions.isPending ? t('common.saving') : t('admin.users.revokeAllSessions')}
                      </Button>
                    ) : undefined}
                    empty={userDetailQuery.data.sessions.length === 0 ? t('admin.users.noSessions') : undefined}
                  >
                    {userDetailQuery.data.sessions.map((session) => {
                      const active = !session.revoked_at && new Date(session.expires_at).getTime() > Date.now()
                      return (
                        <div key={session.ID} className="border-b border-border px-4 py-3 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">#{session.ID}</span>
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                                  {active ? t('admin.users.sessionActive') : t('admin.users.sessionInactive')}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-foreground">{session.user_agent || '-'}</div>
                              <div className="font-mono text-xs text-muted-foreground">{session.ip_address || '-'}</div>
                            </div>
                            {active && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm(t('admin.users.confirmRevokeSession'))) {
                                    revokeSession.mutate({ userId: detailUser.ID, sessionId: session.ID })
                                  }
                                }}
                                disabled={revokeSession.isPending}
                              >
                                {t('admin.users.revokeSession')}
                              </Button>
                            )}
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-3">
                            <div>{t('admin.users.createdAt')}: {formatDate(session.CreatedAt, i18n.language)}</div>
                            <div>{t('admin.users.lastSeenAt')}: {formatDate(session.last_seen_at, i18n.language)}</div>
                            <div>{t('admin.users.expiresAt')}: {formatDate(session.expires_at, i18n.language)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </DetailSection>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <DetailSection title={t('admin.users.organizations')} empty={userDetailQuery.data.orgs.length === 0 ? t('admin.users.noOrgs') : undefined}>
                      {userDetailQuery.data.orgs.map((org) => (
                        <div key={org.ID} className="border-b border-border px-4 py-3 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">{org.name}</div>
                              <div className="font-mono text-xs text-muted-foreground">#{org.ID} · {org.slug}</div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div>{t(`admin.orgs.memberRoles.${org.role}`, { defaultValue: org.role })}</div>
                              <div>{t(`admin.orgs.plans.${org.plan}`, { defaultValue: org.plan })}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">{t('admin.users.joinedAt')}: {formatDate(org.joined_at, i18n.language)}</div>
                        </div>
                      ))}
                    </DetailSection>

                    <DetailSection title={t('admin.users.projects')} empty={userDetailQuery.data.projects.length === 0 ? t('admin.users.noProjects') : undefined}>
                      {userDetailQuery.data.projects.map((project) => (
                        <div key={project.ID} className="border-b border-border px-4 py-3 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">{project.name || t('common.emptyTitle')}</div>
                              <div className="font-mono text-xs text-muted-foreground">#{project.ID}{project.org_id ? ` · org #${project.org_id}` : ''}</div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div>{t(`admin.projects.memberRoles.${project.role}`, { defaultValue: project.role })}</div>
                              <div>{t(`admin.projects.statuses.${project.status}`, { defaultValue: project.status || '-' })}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">{t('admin.users.joinedAt')}: {formatDate(project.joined_at, i18n.language)}</div>
                        </div>
                      ))}
                    </DetailSection>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.users.editTitle')}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{editUser.ID} · {editUser.username}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <FilterField label={t('admin.users.displayName')} value={editDisplayName} onChange={setEditDisplayName} />
              <FilterField label={t('admin.users.email')} value={editEmail} onChange={setEditEmail} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditUser(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" onClick={submitEditUser} disabled={updateUser.isPending}>
                {updateUser.isPending ? t('common.saving') : t('admin.users.saveProfile')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{t('admin.users.pageStatus', { page, pageCount })}</span>
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          {t('admin.users.previousPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
          {t('admin.users.nextPage')}
        </Button>
      </div>
    </div>
  )
}

function DetailMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

function DetailSection({ title, empty, action, children }: { title: string; empty?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        {action}
      </div>
      {empty ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div> : <div>{children}</div>}
    </div>
  )
}

function FilterField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
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
