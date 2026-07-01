import { ActiveOrgSelect } from '@admin/components/admin/ActiveOrgSelect'
import { ActiveUserSelect } from '@admin/components/admin/ActiveUserSelect'
import { auditLogsHref, usageLogsHref } from '@admin/lib/adminLogQueryParams'
import {
  emptyProjectListFilters,
  projectFiltersFromSearchParams,
  projectPageFromSearchParams,
  projectSearchParams,
  type ProjectListFilters,
} from '@admin/lib/adminProjectQueryParams'
import { userListHref } from '@admin/lib/adminUserQueryParams'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { readListPayload, readNumberPayload, readRecordPayload } from '@admin/lib/listPayload'
import { cn } from '@admin/lib/utils'
import { AppDataTableRow, AppFeedbackText, AppInlineError } from '@movscript/ui/business/app'
import { Button, Input, Label } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Pencil, Plus, RefreshCw, ScrollText, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ProjectDetailMetric } from '../components/ProjectDetailMetric'
import type { AdminProject, AdminProjectDetail, AdminProjectMember } from '../model/projectAdminTypes'

// ── Project owner management ─────────────────────────────────────────────────

function formatAdminNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

function formatAdminCredits(value: number | undefined): string {
  return `${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function ProjectOwnerManagementPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [ownerDialog, setOwnerDialog] = useState<AdminProject | null>(null)
  const [editDialog, setEditDialog] = useState<AdminProject | null>(null)
  const [createProjectName, setCreateProjectName] = useState('')
  const [createProjectDescription, setCreateProjectDescription] = useState('')
  const [createProjectOwnerId, setCreateProjectOwnerId] = useState('')
  const [createProjectOrgId, setCreateProjectOrgId] = useState('')
  const [selectedOwnerId, setSelectedOwnerId] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [projectFilters, setProjectFilters] = useState<ProjectListFilters>(() => projectFiltersFromSearchParams(searchParams))
  const [page, setPage] = useState(() => projectPageFromSearchParams(searchParams))
  const [memberDialog, setMemberDialog] = useState<AdminProject | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [projectError, setProjectError] = useState('')
  const { query, projectId: projectIdFilter, ownerId: ownerFilter, orgId: orgFilter } = projectFilters

  const { data, isFetching, refetch, error: projectsQueryError } = useQuery<{ projects: AdminProject[]; total: number }>({
    queryKey: ['admin', 'projects', query, projectIdFilter, ownerFilter, orgFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '25',
      })
      if (query.trim()) params.set('q', query.trim())
      if (projectIdFilter) params.set('project_id', projectIdFilter)
      if (ownerFilter) params.set('owner_id', ownerFilter)
      if (orgFilter) params.set('org_id', orgFilter)
      const res = await api.get(`/admin/projects?${params.toString()}`)
      const payload = readRecordPayload(res.data)
      const projects = readListPayload<AdminProject>(res.data, ['projects', 'items', 'records'])
      return {
        projects,
        total: readNumberPayload(res.headers['x-total-count'] ?? payload.total, projects.length),
      }
    },
  })
  const projects = data?.projects ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / 25))
  const projectMembersQuery = useQuery<AdminProjectMember[]>({
    queryKey: ['admin', 'projects', memberDialog?.ID, 'members'],
    queryFn: () => api.get(`/admin/projects/${memberDialog?.ID}/members`).then((r) => readListPayload<AdminProjectMember>(r.data, ['members', 'items', 'records'])),
    enabled: !!memberDialog,
  })
  const projectDetailQuery = useQuery<AdminProjectDetail>({
    queryKey: ['admin', 'projects', memberDialog?.ID, 'detail'],
    queryFn: () => api.get(`/admin/projects/${memberDialog?.ID}/detail`).then((r) => r.data),
    enabled: !!memberDialog,
  })

  const forceSetOwner = useMutation({
    mutationFn: ({ projectId, ownerId }: { projectId: number; ownerId: number }) =>
      api.put(`/admin/projects/${projectId}/owner`, { owner_id: ownerId }),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      setOwnerDialog(null)
      setSelectedOwnerId('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const deleteProject = useMutation({
    mutationFn: (project: AdminProject) => api.delete(`/admin/projects/${project.ID}`),
    onSuccess: () => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const createProject = useMutation({
    mutationFn: ({ name, description, ownerId, orgId }: { name: string; description: string; ownerId: number; orgId?: number }) =>
      api.post('/admin/projects', { name, description, owner_id: ownerId, org_id: orgId }).then((r) => r.data),
    onSuccess: () => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      setCreateDialogOpen(false)
      setCreateProjectName('')
      setCreateProjectDescription('')
      setCreateProjectOwnerId('')
      setCreateProjectOrgId('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const updateProject = useMutation({
    mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
      api.patch(`/admin/projects/${projectId}`, { name }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
      setEditDialog(null)
      setEditProjectName('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const addProjectMember = useMutation({
    mutationFn: ({ projectId, userId, role }: { projectId: number; userId: number; role: string }) =>
      api.post(`/admin/projects/${projectId}/members`, { user_id: userId, role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      setNewMemberUserId('')
      setNewMemberRole('viewer')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const updateProjectMember = useMutation({
    mutationFn: ({ projectId, memberId, role }: { projectId: number; memberId: number; role: string }) =>
      api.patch(`/admin/projects/${projectId}/members/${memberId}`, { role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const removeProjectMember = useMutation({
    mutationFn: ({ projectId, memberId }: { projectId: number; memberId: number }) =>
      api.delete(`/admin/projects/${projectId}/members/${memberId}`),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })

  const openOwnerDialog = (project: AdminProject) => {
    setOwnerDialog(project)
    setSelectedOwnerId('')
  }

  const openEditDialog = (project: AdminProject) => {
    setEditDialog(project)
    setEditProjectName(project.name || '')
  }

  function updateProjectFilter(key: keyof ProjectListFilters, value: string) {
    const next = { ...projectFilters, [key]: value }
    setProjectFilters(next)
    setPage(1)
    setSearchParams(projectSearchParams(next, 1), { replace: true })
  }

  const clearFilters = () => {
    setProjectFilters(emptyProjectListFilters)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  function updateProjectPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage))
    setPage(normalized)
    setSearchParams(projectSearchParams(projectFilters, normalized), { replace: true })
  }

  const removeProject = (project: AdminProject) => {
    if (window.confirm(t('admin.projects.confirmDelete', { name: project.name || `#${project.ID}` }))) {
      deleteProject.mutate(project)
    }
  }

  const submitProjectCreate = () => {
    const ownerId = Number(createProjectOwnerId)
    const orgId = createProjectOrgId ? Number(createProjectOrgId) : undefined
    if (!createProjectName.trim() || !Number.isFinite(ownerId) || ownerId <= 0) return
    if (orgId !== undefined && (!Number.isFinite(orgId) || orgId <= 0)) return
    createProject.mutate({
      name: createProjectName,
      description: createProjectDescription,
      ownerId,
      orgId,
    })
  }

  const submitProjectUpdate = () => {
    if (!editDialog || !editProjectName.trim()) return
    updateProject.mutate({ projectId: editDialog.ID, name: editProjectName })
  }

  useEffect(() => {
    setProjectFilters(projectFiltersFromSearchParams(searchParams))
    setPage(projectPageFromSearchParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    if (page > pageCount) updateProjectPage(pageCount)
  }, [page, pageCount])

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.projects.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.projects.description', { total })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus size={13} className="mr-1.5" />
            {t('admin.projects.create')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={cn('mr-1.5', isFetching && 'animate-spin')} />
            {t('admin.projects.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_110px_130px_130px_auto]">
        <Input
          value={query}
          onChange={(event) => updateProjectFilter('query', event.target.value)}
          placeholder={t('admin.projects.searchPlaceholder')}
          className="h-9"
        />
        <Input
          value={projectIdFilter}
          onChange={(event) => updateProjectFilter('projectId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.projectId')}
          className="h-9"
        />
        <Input
          value={ownerFilter}
          onChange={(event) => updateProjectFilter('ownerId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.ownerId')}
          className="h-9"
        />
        <Input
          value={orgFilter}
          onChange={(event) => updateProjectFilter('orgId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.orgId')}
          className="h-9"
        />
        <Button variant="outline" size="sm" onClick={clearFilters}>
          {t('admin.projects.clear')}
        </Button>
      </div>

      {projectError && (
        <AppInlineError>
          {projectError}
        </AppInlineError>
      )}

      {projectsQueryError && (
        <AppInlineError>
          {translateAPIRequestError(projectsQueryError)}
        </AppInlineError>
      )}

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.id')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.owner')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.orgId')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.members')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.updatedAt')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project) => {
              const ownerName = project.owner?.username || (project.owner_id ? `#${project.owner_id}` : t('admin.projects.noOwner'))
              return (
                <AppDataTableRow key={project.ID} interactive tone={project.owner_id === 0 ? 'danger' : undefined}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{project.ID}</td>
                  <td className="px-4 py-3 font-medium">{project.name || t('common.emptyTitle')}</td>
                  <td className="px-4 py-3">
                    <AppFeedbackText as="span" tone={project.owner_id === 0 ? 'danger' : 'neutral'} className={project.owner_id === 0 ? 'font-medium' : undefined}>
                      {ownerName}
                    </AppFeedbackText>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{project.org_id ? `#${project.org_id}` : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setMemberDialog(project)}
                      className="font-mono text-sm tabular-nums text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      {(project.members?.length ?? 0).toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {project.UpdatedAt ? new Date(project.UpdatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEditDialog(project)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={t('admin.projects.edit')}
                      aria-label={t('admin.projects.edit')}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => openOwnerDialog(project)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('admin.projects.changeOwner')}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      intent="danger"
                      onClick={() => removeProject(project)}
                      disabled={deleteProject.isPending}
                      title={t('admin.projects.delete')}
                      aria-label={t('admin.projects.delete')}
                    >
                      <Trash2 size={13} />
                    </Button>
                    </div>
                  </td>
                </AppDataTableRow>
              )
            })}
            {!projectsQueryError && projects.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">{t('admin.projects.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('admin.projects.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => updateProjectPage(page - 1)} disabled={page === 1}>
              {t('admin.projects.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => updateProjectPage(page + 1)} disabled={page === pageCount}>
              {t('admin.projects.nextPage')}
            </Button>
          </div>
        </div>
      )}

      {memberDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.membersTitle', { name: memberDialog.name || `#${memberDialog.ID}` })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{memberDialog.ID}</p>
              </div>
              <button
                type="button"
                onClick={() => setMemberDialog(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-border px-5 py-4">
              {projectDetailQuery.error && (
                <AppInlineError className="mb-3">
                  {translateAPIRequestError(projectDetailQuery.error)}
                </AppInlineError>
              )}
              {projectDetailQuery.isLoading && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {projectDetailQuery.data && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ProjectDetailMetric label={t('admin.projects.detailMembers')} value={formatAdminNumber(projectDetailQuery.data.member_count)} />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailProduction')}
                    value={formatAdminNumber(projectDetailQuery.data.content_unit_count)}
                    detail={t('admin.projects.detailProductionBreakdown', {
                      scripts: formatAdminNumber(projectDetailQuery.data.script_count),
                      slots: formatAdminNumber(projectDetailQuery.data.asset_slot_count),
                      resources: formatAdminNumber(projectDetailQuery.data.resource_count),
                    })}
                  />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailUsageCost')}
                    value={formatAdminCredits(projectDetailQuery.data.usage.cost)}
                    detail={t('admin.projects.detailUsageCalls', { count: formatAdminNumber(projectDetailQuery.data.usage.calls) })}
                  />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailAuditRecords')}
                    value={formatAdminNumber(projectDetailQuery.data.audit.records)}
                    detail={projectDetailQuery.data.audit.last_action ? `${projectDetailQuery.data.audit.last_action} · ${projectDetailQuery.data.audit.last_at ? new Date(projectDetailQuery.data.audit.last_at).toLocaleString() : '-'}` : undefined}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={usageLogsHref({ projectId: memberDialog.ID })}>
                    <BarChart3 size={14} className="mr-2" />
                    {t('admin.projects.viewUsageLogs')}
                  </Link>
                </Button>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={auditLogsHref({ projectId: memberDialog.ID })}>
                    <ScrollText size={14} className="mr-2" />
                    {t('admin.projects.viewAuditLogs')}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-2 border-b border-border bg-card/60 px-5 py-3 md:grid-cols-[minmax(0,1fr)_150px_auto]">
              <ActiveUserSelect
                value={newMemberUserId}
                onChange={setNewMemberUserId}
                placeholder={t('admin.projects.selectMemberUser')}
                emptyLabel={t('admin.projects.noOwnerCandidates')}
              />
              <select
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {['director', 'writer', 'generator', 'viewer'].map((role) => (
                  <option key={role} value={role}>{t(`admin.projects.memberRoles.${role}`, { defaultValue: role })}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={() => addProjectMember.mutate({ projectId: memberDialog.ID, userId: Number(newMemberUserId), role: newMemberRole })}
                disabled={addProjectMember.isPending || !newMemberUserId}
              >
                {addProjectMember.isPending ? t('common.saving') : t('admin.projects.addMember')}
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-card">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.member')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.role')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.joinedAt')}</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectMembersQuery.error && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3">
                        <AppFeedbackText>{translateAPIRequestError(projectMembersQuery.error)}</AppFeedbackText>
                      </td>
                    </tr>
                  )}
                  {projectMembersQuery.isLoading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
                    </tr>
                  )}
                  {!projectMembersQuery.isLoading && !projectMembersQuery.error && (projectMembersQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.projects.noMembers')}</td>
                    </tr>
                  )}
                  {(projectMembersQuery.data ?? []).map((member) => (
                    <tr key={member.ID}>
                      <td className="px-4 py-3">
                        <Link to={userListHref({ userId: member.user_id })} className="block font-medium text-foreground underline-offset-2 hover:underline">
                          {member.user?.display_name || member.user?.username || `#${member.user_id}`}
                        </Link>
                        <Link to={userListHref({ userId: member.user_id })} className="block font-mono text-xs text-muted-foreground underline-offset-2 hover:underline">
                          #{member.user_id}{member.user?.primary_email ? ` · ${member.user.primary_email}` : ''}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {member.role === 'owner' ? (
                          <span className="text-xs text-muted-foreground">{t('admin.projects.memberRoles.owner')}</span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(event) => updateProjectMember.mutate({ projectId: memberDialog.ID, memberId: member.ID, role: event.target.value })}
                            disabled={updateProjectMember.isPending}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {['director', 'writer', 'generator', 'viewer'].map((role) => (
                              <option key={role} value={role}>{t(`admin.projects.memberRoles.${role}`, { defaultValue: role })}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {member.CreatedAt ? new Date(member.CreatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.role !== 'owner' && (
                          <Button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('admin.projects.confirmRemoveMember'))) {
                                removeProjectMember.mutate({ projectId: memberDialog.ID, memberId: member.ID })
                              }
                            }}
                            disabled={removeProjectMember.isPending}
                            variant="ghost"
                            size="icon-xs"
                            intent="danger"
                            title={t('admin.projects.removeMember')}
                            aria-label={t('admin.projects.removeMember')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.createTitle')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.projects.createHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateDialogOpen(false)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3 p-5">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.name')}</Label>
                <Input value={createProjectName} onChange={(event) => setCreateProjectName(event.target.value)} className="h-9" autoFocus />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.projectDescription')}</Label>
                <Input value={createProjectDescription} onChange={(event) => setCreateProjectDescription(event.target.value)} className="h-9" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <ActiveUserSelect
                    label={t('admin.projects.ownerId')}
                    value={createProjectOwnerId}
                    onChange={setCreateProjectOwnerId}
                    placeholder={t('admin.projects.selectOwnerUser')}
                    emptyLabel={t('admin.projects.noOwnerCandidates')}
                  />
                </div>
                <div>
                  <ActiveOrgSelect
                    label={t('admin.projects.orgId')}
                    value={createProjectOrgId}
                    onChange={setCreateProjectOrgId}
                    placeholder={t('admin.projects.selectOrg')}
                    emptyLabel={t('admin.projects.noOrgCandidates')}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={submitProjectCreate} disabled={createProject.isPending || !createProjectName.trim() || !createProjectOwnerId}>
                {createProject.isPending ? t('common.saving') : t('admin.projects.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.editTitle')}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{editDialog.ID}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditDialog(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.name')}</Label>
                <Input
                  value={editProjectName}
                  onChange={(event) => setEditProjectName(event.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => setEditDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={submitProjectUpdate} disabled={updateProject.isPending || !editProjectName.trim()}>
                {updateProject.isPending ? t('common.saving') : t('admin.projects.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {ownerDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-96 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">{t('admin.projects.changeOwnerTitle', { name: ownerDialog.name })}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.projects.changeOwnerHint')}</p>
            </div>
            <div>
              <ActiveUserSelect
                label={t('admin.projects.newOwner')}
                value={selectedOwnerId}
                onChange={setSelectedOwnerId}
                placeholder={t('admin.projects.selectOwnerUser')}
                emptyLabel={t('admin.projects.noOwnerCandidates')}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => forceSetOwner.mutate({ projectId: ownerDialog.ID, ownerId: Number(selectedOwnerId) })}
                disabled={forceSetOwner.isPending || !selectedOwnerId}
                className="flex-1"
              >
                {forceSetOwner.isPending ? t('common.saving') : t('admin.projects.forceChange')}
              </Button>
              <Button variant="outline" onClick={() => setOwnerDialog(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
