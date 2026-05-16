import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Download, RefreshCw, Search, ScrollText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { PaginationControls } from '@/components/admin/PaginationControls'
import { downloadAdminCSV } from '@/lib/adminExport'
import {
  auditFiltersFromSearchParams,
  auditSearchParams,
  emptyAuditLogFilters,
  pageFromSearchParams,
  type AuditLogFilters,
} from '@/lib/adminLogQueryParams'
import { translateAPIRequestError } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import type { AuditLog, PaginatedResponse } from '@/types'

const PAGE_SIZE = 50

type AuditLogSummary = {
  totals: { records: number; unique_actors: number }
  top_actions: Array<{ action: string; count: number }>
  top_targets: Array<{ target_type: string; count: number }>
  top_actors: Array<{ actor_id: number; count: number }>
  generated_at: string
}

function toRFC3339(value: string, endOfMinute = false): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  if (endOfMinute) {
    date.setSeconds(59)
    date.setMilliseconds(999)
  }
  return date.toISOString()
}

function formatDate(value: string, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMaybeId(value?: number | string): string {
  if (value === undefined || value === null || value === '') return '-'
  return `#${value}`
}

function prettyMetadata(value?: string): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function AuditLogsPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(() => pageFromSearchParams(searchParams))
  const [filters, setFilters] = useState<AuditLogFilters>(() => auditFiltersFromSearchParams(searchParams))
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    setPage(pageFromSearchParams(searchParams))
    setFilters(auditFiltersFromSearchParams(searchParams))
  }, [searchParams])

  const summaryParams = useMemo(() => ({
    actor_id: filters.actorId.trim() || undefined,
    action: filters.action.trim() || undefined,
    target_type: filters.targetType.trim() || undefined,
    target_id: filters.targetId.trim() || undefined,
    org_id: filters.orgId.trim() || undefined,
    project_id: filters.projectId.trim() || undefined,
    since: toRFC3339(filters.since),
    until: toRFC3339(filters.until, true),
  }), [filters])

  const params = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    ...summaryParams,
  }), [page, summaryParams])

  const logsQuery = useQuery<PaginatedResponse<AuditLog>>({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: () => api.get('/admin/audit-logs', { params }).then((r) => r.data),
  })
  const summaryQuery = useQuery<AuditLogSummary>({
    queryKey: ['admin', 'audit-logs', 'summary', summaryParams],
    queryFn: () => api.get('/admin/audit-logs/summary', { params: summaryParams }).then((r) => r.data),
  })

  const items = logsQuery.data?.items ?? []
  const total = logsQuery.data?.total ?? 0
  const responsePageSize = logsQuery.data?.page_size ?? PAGE_SIZE
  const summary = summaryQuery.data
  const pageCount = Math.max(1, Math.ceil(total / responsePageSize))
  const hasFilters = Object.values(filters).some((value) => value.trim() !== '')
  const queryError = logsQuery.error || summaryQuery.error

  useEffect(() => {
    if (logsQuery.data && page > pageCount) {
      updatePage(pageCount)
    }
  }, [logsQuery.data, page, pageCount])

  function updateFilter<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    setPage(1)
    setSearchParams(auditSearchParams(next, 1), { replace: true })
  }

  function clearFilters() {
    setFilters(emptyAuditLogFilters)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  function updatePage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage))
    setPage(normalized)
    setSearchParams(auditSearchParams(filters, normalized), { replace: true })
  }

  async function exportCSV() {
    setExportError('')
    setIsExporting(true)
    try {
      await downloadAdminCSV('/admin/audit-logs/export', summaryParams, 'audit-logs.csv')
    } catch (err: unknown) {
      setExportError(translateAPIRequestError(err))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ScrollText size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('admin.auditLogs.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.auditLogs.description', { total })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={isExporting}
          >
            <Download size={14} className="mr-2" />
            {isExporting ? t('common.loadingShort') : t('admin.auditLogs.export')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => logsQuery.refetch()}
            disabled={logsQuery.isFetching}
          >
            <RefreshCw size={14} className={cn('mr-2', logsQuery.isFetching && 'animate-spin')} />
            {t('admin.auditLogs.refresh')}
          </Button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {exportError}
        </div>
      )}

      {queryError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(queryError)}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <FilterField
            label={t('admin.auditLogs.actorId')}
            value={filters.actorId}
            onChange={(value) => updateFilter('actorId', value)}
            placeholder="42"
          />
          <FilterField
            label={t('admin.auditLogs.action')}
            value={filters.action}
            onChange={(value) => updateFilter('action', value)}
            placeholder="project.update"
          />
          <FilterField
            label={t('admin.auditLogs.targetType')}
            value={filters.targetType}
            onChange={(value) => updateFilter('targetType', value)}
            placeholder="project"
          />
          <FilterField
            label={t('admin.auditLogs.targetId')}
            value={filters.targetId}
            onChange={(value) => updateFilter('targetId', value)}
            placeholder="128"
          />
          <FilterField
            label={t('admin.auditLogs.orgId')}
            value={filters.orgId}
            onChange={(value) => updateFilter('orgId', value)}
            placeholder="64"
          />
          <FilterField
            label={t('admin.auditLogs.projectId')}
            value={filters.projectId}
            onChange={(value) => updateFilter('projectId', value)}
            placeholder="128"
          />
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="w-full"
            >
              <X size={14} className="mr-2" />
              {t('admin.auditLogs.clear')}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <DateFilter
            label={t('admin.auditLogs.since')}
            value={filters.since}
            onChange={(value) => updateFilter('since', value)}
          />
          <DateFilter
            label={t('admin.auditLogs.until')}
            value={filters.until}
            onChange={(value) => updateFilter('until', value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t('admin.auditLogs.summary.records')} value={(summary?.totals.records ?? 0).toLocaleString()} detail={t('admin.auditLogs.summary.filtered')} />
        <SummaryCard label={t('admin.auditLogs.summary.uniqueActors')} value={(summary?.totals.unique_actors ?? 0).toLocaleString()} detail={t('admin.auditLogs.actor')} />
        <SummaryCard label={t('admin.auditLogs.summary.topAction')} value={summary?.top_actions[0]?.action ?? '-'} detail={summary?.top_actions[0] ? t('admin.auditLogs.summary.recordCount', { count: summary.top_actions[0].count.toLocaleString() }) : t('admin.auditLogs.empty')} />
        <SummaryCard label={t('admin.auditLogs.summary.topTarget')} value={summary?.top_targets[0]?.target_type ?? '-'} detail={summary?.top_targets[0] ? t('admin.auditLogs.summary.recordCount', { count: summary.top_targets[0].count.toLocaleString() }) : t('admin.auditLogs.empty')} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <SummaryBreakdown title={t('admin.auditLogs.summary.byAction')}>
          {(summary?.top_actions ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.top_actions.slice(0, 5).map((row) => (
            <SummaryRow key={row.action} label={row.action || '-'} value={row.count.toLocaleString()} />
          ))}
        </SummaryBreakdown>
        <SummaryBreakdown title={t('admin.auditLogs.summary.byTarget')}>
          {(summary?.top_targets ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.top_targets.slice(0, 5).map((row) => (
            <SummaryRow key={row.target_type} label={row.target_type || '-'} value={row.count.toLocaleString()} />
          ))}
        </SummaryBreakdown>
        <SummaryBreakdown title={t('admin.auditLogs.summary.byActor')}>
          {(summary?.top_actors ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.top_actors.slice(0, 5).map((row) => (
            <SummaryRow key={row.actor_id} label={`#${row.actor_id}`} value={row.count.toLocaleString()} />
          ))}
        </SummaryBreakdown>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.time')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.actor')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.action')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.target')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.scope')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.auditLogs.request')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((log) => {
              const metadata = prettyMetadata(log.metadata)
              return (
                <tr key={log.ID} className="align-top hover:bg-card/70">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(log.CreatedAt, i18n.language)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatMaybeId(log.actor_id)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{log.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-foreground">{log.target_type || '-'}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{log.target_id || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div>{t('admin.auditLogs.org')}: {formatMaybeId(log.org_id)}</div>
                    <div>{t('admin.auditLogs.project')}: {formatMaybeId(log.project_id)}</div>
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs">
                    <div className="break-all font-mono text-muted-foreground">{log.request_id || '-'}</div>
                    {(log.ip_address || log.user_agent) && (
                      <div className="mt-1 text-muted-foreground">
                        {log.ip_address || '-'}{log.user_agent ? ` · ${log.user_agent}` : ''}
                      </div>
                    )}
                    {metadata && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          {t('admin.auditLogs.metadata')}
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-words">{metadata}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              )
            })}
            {!logsQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Search size={18} className="mx-auto mb-2 opacity-60" />
                  {t('admin.auditLogs.empty')}
                </td>
              </tr>
            )}
            {logsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('common.loading')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} pageCount={pageCount} pageSize={responsePageSize} total={total} onPageChange={updatePage} disabled={logsQuery.isFetching} />
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function SummaryBreakdown({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
      <span className="min-w-0 truncate font-mono text-foreground">{label}</span>
      <span className="shrink-0 font-mono text-muted-foreground">{value}</span>
    </div>
  )
}

function SummaryEmpty() {
  const { t } = useTranslation()
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.auditLogs.empty')}</p>
}

function FilterField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 text-xs" />
    </div>
  )
}
