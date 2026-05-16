import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { downloadAdminCSV } from '@/lib/adminExport'
import {
  emptyUsageFilters,
  pageFromSearchParams,
  usageFiltersFromSearchParams,
  usageSearchParams,
  type UsageFilters,
} from '@/lib/adminLogQueryParams'
import { translateAPIRequestError } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import type { AICredential, PaginatedResponse, UsageLog } from '@/types'

const PAGE_SIZE = 50

type UsageTotals = {
  records: number
  cost: number
  input_tokens: number
  output_tokens: number
  duration_sec: number
  image_count: number
}

type UsageSummary = {
  totals: UsageTotals
  operations: Array<UsageTotals & { operation_type: string }>
  top_models: Array<UsageTotals & { model_config_id: number; ai_model_config?: UsageLog['ai_model_config'] }>
  top_users: Array<UsageTotals & { user_id: number; user?: UsageLog['user'] }>
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatUsage(log: UsageLog): string {
  if (log.input_tokens > 0 || log.output_tokens > 0) {
    return `${log.input_tokens.toLocaleString()} / ${log.output_tokens.toLocaleString()}`
  }
  if (log.duration_sec > 0) return `${log.duration_sec}s`
  if (log.image_count > 0) return `x${log.image_count}`
  return '-'
}

function modelLabel(log: UsageLog): string {
  return modelConfigLabel(log.ai_model_config, log.ai_model_config_id)
}

function modelConfigLabel(cfg: UsageLog['ai_model_config'], fallbackId: number): string {
  if (!cfg) return `#${fallbackId}`
  return cfg.short_name || cfg.custom_display_name || cfg.model_id_override || cfg.model_def_id || `#${cfg.ID}`
}

function formatCost(value: number | undefined, digits = 4): string {
  return (value ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function UsageLogsPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(() => pageFromSearchParams(searchParams))
  const [filters, setFilters] = useState<UsageFilters>(() => usageFiltersFromSearchParams(searchParams))
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    setPage(pageFromSearchParams(searchParams))
    setFilters(usageFiltersFromSearchParams(searchParams))
  }, [searchParams])

  const credentialsQuery = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  const summaryParams = useMemo(() => ({
    provider_id: filters.providerId || undefined,
    model_config_id: filters.modelConfigId || undefined,
    operation_type: filters.operationType || undefined,
    user_id: filters.userId.trim() || undefined,
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

  const logsQuery = useQuery<PaginatedResponse<UsageLog>>({
    queryKey: ['admin', 'usage-logs', params],
    queryFn: () => api.get('/admin/usage-logs', { params }).then((r) => r.data),
  })
  const summaryQuery = useQuery<UsageSummary>({
    queryKey: ['admin', 'usage-logs', 'summary', summaryParams],
    queryFn: () => api.get('/admin/usage-logs/summary', { params: summaryParams }).then((r) => r.data),
  })

  const items = logsQuery.data?.items ?? []
  const total = logsQuery.data?.total ?? 0
  const summary = summaryQuery.data
  const credentials = credentialsQuery.data ?? []
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const models = credentials.flatMap((credential) =>
    (credential.models ?? []).map((model) => ({ ...model, providerName: credential.display_name })),
  )
  const providerById = new Map(credentials.map((credential) => [credential.ID, credential.display_name]))
  const hasFilters = Object.values(filters).some((value) => value.trim() !== '')
  const queryError = credentialsQuery.error || logsQuery.error || summaryQuery.error

  function updateFilter<K extends keyof UsageFilters>(key: K, value: UsageFilters[K]) {
    const next = { ...filters, [key]: value }
    if (key === 'providerId') next.modelConfigId = ''
    setFilters(next)
    setPage(1)
    setSearchParams(usageSearchParams(next, 1), { replace: true })
  }

  function clearFilters() {
    setFilters(emptyUsageFilters)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  function updatePage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage))
    setPage(normalized)
    setSearchParams(usageSearchParams(filters, normalized), { replace: true })
  }

  function providerLabel(log: UsageLog): string {
    const credentialId = log.ai_model_config?.credential_id
    return credentialId ? providerById.get(credentialId) ?? `#${credentialId}` : '-'
  }

  async function exportCSV() {
    setExportError('')
    setIsExporting(true)
    try {
      await downloadAdminCSV('/admin/usage-logs/export', summaryParams, 'usage-logs.csv')
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
            <BarChart3 size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('admin.logs.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.logs.description', { total })}</p>
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
            {isExporting ? t('common.loadingShort') : t('admin.logs.export')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
            <RefreshCw size={14} className={cn('mr-2', logsQuery.isFetching && 'animate-spin')} />
            {t('admin.logs.refresh')}
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
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SelectField label={t('admin.logs.provider')} value={filters.providerId} onChange={(value) => updateFilter('providerId', value)}>
            <option value="">{t('admin.logs.allProviders')}</option>
            {credentials.map((credential) => (
              <option key={credential.ID} value={credential.ID}>{credential.display_name}</option>
            ))}
          </SelectField>
          <SelectField label={t('admin.logs.model')} value={filters.modelConfigId} onChange={(value) => updateFilter('modelConfigId', value)}>
            <option value="">{t('admin.logs.allModels')}</option>
            {models
              .filter((model) => !filters.providerId || String(model.credential_id) === filters.providerId)
              .map((model) => (
                <option key={model.ID} value={model.ID}>
                  {model.short_name || model.custom_display_name || model.model_def_id} · {model.providerName}
                </option>
              ))}
          </SelectField>
          <SelectField label={t('admin.logs.type')} value={filters.operationType} onChange={(value) => updateFilter('operationType', value)}>
            <option value="">{t('admin.logs.allOperations')}</option>
            {['text', 'image', 'video'].map((type) => (
              <option key={type} value={type}>{t(`admin.logs.operations.${type}`, { defaultValue: type })}</option>
            ))}
          </SelectField>
          <FilterField label={t('admin.logs.userId')} value={filters.userId} onChange={(value) => updateFilter('userId', value)} placeholder="42" />
          <FilterField label={t('admin.logs.orgId')} value={filters.orgId} onChange={(value) => updateFilter('orgId', value)} placeholder="1" />
          <FilterField label={t('admin.logs.projectId')} value={filters.projectId} onChange={(value) => updateFilter('projectId', value)} placeholder="128" />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <DateFilter label={t('admin.logs.since')} value={filters.since} onChange={(value) => updateFilter('since', value)} />
          <DateFilter label={t('admin.logs.until')} value={filters.until} onChange={(value) => updateFilter('until', value)} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="self-end"
          >
            {t('admin.logs.clear')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label={t('admin.logs.summary.records')} value={formatCost(summary?.totals.records, 0)} detail={t('admin.logs.summary.filtered')} />
        <SummaryCard label={t('admin.logs.summary.cost')} value={formatCost(summary?.totals.cost)} detail="credits" />
        <SummaryCard label={t('admin.logs.summary.tokens')} value={`${formatCost(summary?.totals.input_tokens, 0)} / ${formatCost(summary?.totals.output_tokens, 0)}`} detail={t('admin.logs.summary.inputOutput')} />
        <SummaryCard label={t('admin.logs.summary.images')} value={formatCost(summary?.totals.image_count, 0)} detail={t('admin.logs.operations.image')} />
        <SummaryCard label={t('admin.logs.summary.duration')} value={`${formatCost(summary?.totals.duration_sec, 0)}s`} detail={t('admin.logs.operations.video')} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <SummaryBreakdown title={t('admin.logs.summary.byOperation')}>
          {(summary?.operations ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.operations.map((row) => (
            <SummaryRow
              key={row.operation_type}
              label={t(`admin.logs.operations.${row.operation_type}`, { defaultValue: row.operation_type })}
              value={formatCost(row.cost)}
              detail={t('admin.logs.summary.recordCount', { count: formatCost(row.records, 0) })}
            />
          ))}
        </SummaryBreakdown>
        <SummaryBreakdown title={t('admin.logs.summary.topModels')}>
          {(summary?.top_models ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.top_models.slice(0, 5).map((row) => (
            <SummaryRow
              key={row.model_config_id}
              label={modelConfigLabel(row.ai_model_config, row.model_config_id)}
              value={formatCost(row.cost)}
              detail={t('admin.logs.summary.recordCount', { count: formatCost(row.records, 0) })}
            />
          ))}
        </SummaryBreakdown>
        <SummaryBreakdown title={t('admin.logs.summary.topUsers')}>
          {(summary?.top_users ?? []).length === 0 ? (
            <SummaryEmpty />
          ) : summary?.top_users.slice(0, 5).map((row) => (
            <SummaryRow
              key={row.user_id}
              label={row.user?.username ?? `#${row.user_id}`}
              value={formatCost(row.cost)}
              detail={t('admin.logs.summary.recordCount', { count: formatCost(row.records, 0) })}
            />
          ))}
        </SummaryBreakdown>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.time')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.user')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.provider')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.model')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.type')}</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.logs.usage')}</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.logs.cost')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.scope')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((log) => (
              <tr key={log.ID} className="hover:bg-card/70">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(log.CreatedAt, i18n.language)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{log.user?.username ?? `#${log.user_id}`}</div>
                  <div className="font-mono text-xs text-muted-foreground">#{log.user_id}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{providerLabel(log)}</td>
                <td className="px-4 py-3 font-mono text-xs">{modelLabel(log)}</td>
                <td className="px-4 py-3 text-xs">{t(`admin.logs.operations.${log.operation_type}`, { defaultValue: log.operation_type })}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatUsage(log)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{log.cost.toFixed(4)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <div>{t('admin.logs.orgId')}: {log.org_id ? `#${log.org_id}` : '-'}</div>
                  <div>{t('admin.logs.projectId')}: {log.project_id ? `#${log.project_id}` : '-'}</div>
                </td>
              </tr>
            ))}
            {!logsQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('admin.logs.empty')}</td>
              </tr>
            )}
            {logsQuery.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{t('admin.logs.pageStatus', { page, pageCount })}</span>
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => updatePage(page - 1)}>
          {t('admin.logs.previousPage')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => updatePage(page + 1)}>
          {t('admin.logs.nextPage')}
        </Button>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
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

function SummaryRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 font-mono text-muted-foreground">{value}</span>
    </div>
  )
}

function SummaryEmpty() {
  const { t } = useTranslation()
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.logs.empty')}</p>
}

function FilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 text-xs" />
    </div>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring"
      >
        {children}
      </select>
    </div>
  )
}
