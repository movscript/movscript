import { auditLogsHref } from '@admin/lib/adminLogQueryParams'
import { projectListHref } from '@admin/lib/adminProjectQueryParams'
import {
  emptyResourceListFilters,
  resourceFiltersFromSearchParams,
  resourceListHref,
  resourcePageFromSearchParams,
  resourceSearchParams,
  type ResourceListFilters,
} from '@admin/lib/adminResourceQueryParams'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import type { PaginatedResponse, RawResource } from '@admin/types'
import { AppInlineError, AppMarkerDot } from '@movscript/ui/business/app'
import { Button, Input, Label, StatusBadge } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, ScrollText, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ResourceDetailField, ResourceDetailPreview } from '../components/ResourceDetailPreview'
import type { ResourceAdminDetail } from '../model/storageTypes'

// ── Storage admin ────────────────────────────────────────────────────────────

export function StoragePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [resourcePage, setResourcePage] = useState(() => resourcePageFromSearchParams(searchParams))
  const [detailResource, setDetailResource] = useState<RawResource | null>(null)
  const [resourceFilters, setResourceFilters] = useState<ResourceListFilters>(() => resourceFiltersFromSearchParams(searchParams))
  const [resourceError, setResourceError] = useState('')
  const { data: backends, error: backendsQueryError } = useQuery<{ default: string; backends: { name: string; available: boolean }[] }>({
    queryKey: ['admin-storage-backends'],
    queryFn: () => api.get('/admin/resource-storage/backends').then(r => r.data),
  })

  const { data: stats = [], error: statsQueryError } = useQuery<{
    user_id: number
    username: string
    storage_backend: string
    count: number
    total_size: number
  }[]>({
    queryKey: ['admin-storage-stats'],
    queryFn: () => api.get('/admin/resource-storage/stats').then(r => r.data),
  })
  const resourceParams = {
    page: resourcePage,
    page_size: 50,
    q: resourceFilters.q.trim() || undefined,
    type: resourceFilters.type || undefined,
    storage_backend: resourceFilters.storageBackend || undefined,
    user_id: resourceFilters.userId.trim() || undefined,
    org_id: resourceFilters.orgId.trim() || undefined,
  }
  const { data: resources, isLoading: resourcesLoading, error: resourcesQueryError } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['admin-storage-resources', resourceParams],
    queryFn: () => api.get('/admin/resource-storage/resources', { params: resourceParams }).then(r => r.data),
  })
  const resourcePageCount = Math.max(1, Math.ceil((resources?.total ?? 0) / 50))
  const resourceDetailQuery = useQuery<ResourceAdminDetail>({
    queryKey: ['admin-storage-resources', detailResource?.ID, 'detail'],
    queryFn: () => api.get(`/admin/resource-storage/resources/${detailResource?.ID}/detail`).then(r => r.data),
    enabled: !!detailResource,
  })
  const deleteResource = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/resource-storage/resources/${id}`),
    onSuccess: (_data, id) => {
      setResourceError('')
      if (detailResource?.ID === id) setDetailResource(null)
      qc.invalidateQueries({ queryKey: ['admin-storage-resources'] })
      qc.invalidateQueries({ queryKey: ['admin-storage-stats'] })
    },
    onError: (err: any) => setResourceError(translateAPIRequestError(err)),
  })

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }
  function updateResourceFilter(key: keyof ResourceListFilters, value: string) {
    const next = { ...resourceFilters, [key]: value }
    setResourceFilters(next)
    setResourcePage(1)
    setSearchParams(resourceSearchParams(next, 1), { replace: true })
  }
  function clearResourceFilters() {
    setResourceFilters(emptyResourceListFilters)
    setResourcePage(1)
    setSearchParams({}, { replace: true })
  }
  function updateResourcePage(nextPage: number) {
    const normalized = Math.max(1, Math.min(resourcePageCount, nextPage))
    setResourcePage(normalized)
    setSearchParams(resourceSearchParams(resourceFilters, normalized), { replace: true })
  }
  function formatDate(value?: string) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    setResourceFilters(resourceFiltersFromSearchParams(searchParams))
    setResourcePage(resourcePageFromSearchParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    if (resourcePage > resourcePageCount) updateResourcePage(resourcePageCount)
  }, [resourcePage, resourcePageCount])

  // Group by user
  const byUser: Record<number, { username: string; backends: Record<string, { count: number; size: number }> }> = {}
  for (const row of stats) {
    if (!byUser[row.user_id]) byUser[row.user_id] = { username: row.username, backends: {} }
    byUser[row.user_id].backends[row.storage_backend] = { count: row.count, size: row.total_size }
  }
  const storageQueryError = backendsQueryError || statsQueryError || resourcesQueryError

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.internalStorage')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.internalStorageDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.modelInputRelay')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.modelInputRelayDescription')}
          </p>
        </div>
      </div>

      {storageQueryError && (
        <AppInlineError>
          {translateAPIRequestError(storageQueryError)}
        </AppInlineError>
      )}

      {/* Backend status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.internalBackends')}</h3>
        <div className="flex gap-3 flex-wrap">
          {(backends?.backends ?? []).map(b => (
            <div key={b.name} className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm">
              <AppMarkerDot tone={b.available ? 'success' : 'danger'} size="xs" />
              {b.name === 'local'
                ? <span className="i-lucide-hard-drive text-muted-foreground" />
                : <span className="i-lucide-cloud text-info" />
              }
              <span className="font-medium capitalize">{b.name}</span>
              {b.name === backends?.default && (
                <StatusBadge intent="info">{t('admin.storage.default')}</StatusBadge>
              )}
              <StatusBadge intent="success" emphasis="plain">{t('admin.storage.available')}</StatusBadge>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.userResourceUsage')}</h3>
        {Object.keys(byUser).length === 0 && !statsQueryError ? (
          <p className="text-sm text-muted-foreground">{t('admin.storage.noResourceData')}</p>
        ) : Object.keys(byUser).length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.logs.user')}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.internalBackend')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.fileCount')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.usedSpace')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byUser).flatMap(([uid, u]) =>
                  Object.entries(u.backends).map(([backend, info], idx) => (
                    <tr key={`${uid}-${backend}`} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-foreground">{idx === 0 ? u.username : ''}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{backend}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <Link
                          to={resourceListHref({ userId: uid, storageBackend: backend })}
                          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                        >
                          {info.count}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatBytes(info.size)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('admin.storage.resourceDetails')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.storage.resourceDetailsDescription')}</p>
          </div>
        </div>
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.search')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.q} onChange={(event) => updateResourceFilter('q', event.target.value)} placeholder={t('admin.storage.searchPlaceholder')} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.type')}</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={resourceFilters.type} onChange={(event) => updateResourceFilter('type', event.target.value)}>
                <option value="">{t('common.all')}</option>
                {['image', 'video', 'audio', 'text', 'file'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.internalBackend')}</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={resourceFilters.storageBackend} onChange={(event) => updateResourceFilter('storageBackend', event.target.value)}>
                <option value="">{t('common.all')}</option>
                {(backends?.backends ?? []).map((backend) => <option key={backend.name} value={backend.name}>{backend.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.logs.userId')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.userId} onChange={(event) => updateResourceFilter('userId', event.target.value.replace(/\D/g, ''))} placeholder="42" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.logs.orgId')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.orgId} onChange={(event) => updateResourceFilter('orgId', event.target.value)} placeholder="1 / null" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={clearResourceFilters}
            >
              {t('admin.storage.clear')}
            </Button>
          </div>
        </div>
        {resourceError && <AppInlineError className="mb-3">{resourceError}</AppInlineError>}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.resource')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.user')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.internalBackend')}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.storage.usedSpace')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.createdAt')}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(resources?.items ?? []).map((resource) => (
                <tr key={resource.ID} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">{resource.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">#{resource.ID} · {resource.type} · {resource.mime_type || '-'}</div>
                    {resource.storage_key && <div className="max-w-md truncate font-mono text-xs text-muted-foreground/70">{resource.storage_key}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    <div>{resource.owner?.username ?? `#${resource.owner_id}`}</div>
                    <div className="font-mono">#{resource.owner_id}{resource.org_id ? ` · org #${resource.org_id}` : ''}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{resource.storage_backend || '-'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{formatBytes(resource.size || 0)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{formatDate(resource.CreatedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailResource(resource)}
                    >
                      <Eye size={13} className="mr-1" />
                      {t('admin.storage.details')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { if (window.confirm(t('admin.storage.confirmDeleteResource', { name: resource.name }))) deleteResource.mutate(resource.ID) }}
                      disabled={deleteResource.isPending}
                      intent="danger"
                    >
                      <Trash2 size={13} className="mr-1" />
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
              {!resourcesLoading && !resourcesQueryError && (resources?.items ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.storage.noResources')}</td></tr>
              )}
              {resourcesLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">{t('admin.logs.pageStatus', { page: resourcePage, pageCount: resourcePageCount })}</span>
          <Button type="button" variant="outline" size="sm" disabled={resourcePage <= 1} onClick={() => updateResourcePage(resourcePage - 1)}>{t('admin.logs.previousPage')}</Button>
          <Button type="button" variant="outline" size="sm" disabled={resourcePage >= resourcePageCount} onClick={() => updateResourcePage(resourcePage + 1)}>{t('admin.logs.nextPage')}</Button>
        </div>
      </div>
      {detailResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.storage.detailsTitle', { name: detailResource.name })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{detailResource.ID} · {detailResource.type} · {detailResource.mime_type || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={auditLogsHref({ targetType: 'resource', targetId: detailResource.ID, orgId: detailResource.org_id })}>
                    <ScrollText size={14} className="mr-2" />
                    {t('admin.storage.viewAuditLogs')}
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={() => setDetailResource(null)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('common.close')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-5 py-4">
              {resourceDetailQuery.error && (
                <AppInlineError className="mb-3">
                  {translateAPIRequestError(resourceDetailQuery.error)}
                </AppInlineError>
              )}
              {resourceDetailQuery.isLoading && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {(() => {
                const detail = resourceDetailQuery.data
                const resource = detail?.resource ?? detailResource
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <ResourceDetailField label={t('admin.storage.owner')} value={`${resource.owner?.username ?? `#${resource.owner_id}`} (#${resource.owner_id})`} />
                      <ResourceDetailField label={t('admin.logs.orgId')} value={resource.org_id ? `#${resource.org_id}` : '-'} />
                      <ResourceDetailField label={t('admin.storage.internalBackend')} value={resource.storage_backend || '-'} />
                      <ResourceDetailField label={t('admin.storage.usedSpace')} value={formatBytes(resource.size || 0)} />
                      <ResourceDetailField label={t('admin.storage.createdAt')} value={formatDate(resource.CreatedAt)} />
                      <ResourceDetailField label={t('admin.storage.updatedAt')} value={formatDate(resource.UpdatedAt)} />
                      <ResourceDetailField label={t('admin.storage.shared')} value={resource.is_shared ? t('admin.storage.sharedYes') : t('admin.storage.sharedNo')} />
                      <ResourceDetailField label={t('admin.storage.verification')} value={resource.verification_status || '-'} />
                    </div>
                    {resource.storage_key && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('admin.storage.storageKey')}</p>
                        <div className="break-all rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">{resource.storage_key}</div>
                      </div>
                    )}
                    <ResourceDetailPreview resource={resource} />
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{t('admin.storage.bindings')}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('admin.storage.bindingCount', { count: detail?.binding_count ?? 0 })}
                            {detail && detail.binding_count > detail.bindings.length ? ` · ${t('admin.storage.showingBindings', { count: detail.bindings.length })}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.project')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingOwner')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingRole')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingSource')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.createdAt')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(detail?.bindings ?? []).map((binding) => (
                              <tr key={binding.ID}>
                                <td className="px-4 py-3 font-mono text-xs">
                                  <Link
                                    to={projectListHref({ projectId: binding.project_id })}
                                    className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                                  >
                                    #{binding.project_id}
                                  </Link>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-mono text-xs text-foreground">{binding.owner_type} #{binding.owner_id}</div>
                                  <div className="text-xs text-muted-foreground">{binding.slot || '-'}</div>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  <div>{binding.role}{binding.is_primary ? ` · ${t('admin.storage.primary')}` : ''}</div>
                                  <div>{binding.status || '-'}</div>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  <div>{binding.source_type || '-'}</div>
                                  <div className="font-mono">{binding.source_id ? `#${binding.source_id}` : '-'}</div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(binding.CreatedAt)}</td>
                              </tr>
                            ))}
                            {!resourceDetailQuery.isLoading && (detail?.bindings ?? []).length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.storage.noBindings')}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
        )}
      </div>
    )
  }


// ── Tab: 云端文件存储 ──────────────────────────────────────────────────────────
