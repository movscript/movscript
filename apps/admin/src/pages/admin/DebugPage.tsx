import { useState, useEffect, useRef, useMemo, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { translateAPIRequestError, translateApiError } from '@/lib/apiError'
import type { AICredential, DebugCallResult, DebugHTTPExchange, JobDetail, JobStateTraceEntry, RawCallResult, AdapterDef, ParamDef, LLMCallLog, PaginatedResponse } from '@/types'
import { Bug, RefreshCw, ChevronDown, ChevronRight, Send, Copy, Check, Zap, CheckCircle2, XCircle, PlayCircle, Trash2, Activity, AlertTriangle, Clock3, Server, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { PaginationControls } from '@/components/admin/PaginationControls'
import { useTranslation } from 'react-i18next'
import {
  DEBUG_TABS,
  debugTabFromSearchParams,
  emptyJobMonitorFilters,
  hasJobFilterSearchParams,
  jobFiltersFromSearchParams,
  jobMonitorPageFromSearchParams,
  jobSearchParams,
  jobUrlSearchParams,
  type DebugTab,
  type JobMonitorFilters,
} from '@/lib/adminJobQueryParams'
import { jobActionConfirmKey, type AdminJobAction } from '@/lib/adminActionGuards'
import { auditLogsHref, usageLogsHref } from '@/lib/adminLogQueryParams'
import { adminHref } from '@/lib/adminRoutes'

// ── Shared helpers ────────────────────────────────────────────────────────────

function tryFormatJSON(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

function buildCurlCommand(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const parts = [`curl -X ${method}`]
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`  -H ${JSON.stringify(`${k}: ${v}`)}`)
  }
  if (body && method !== 'GET') {
    const trimmed = body.trim()
    if (trimmed && trimmed !== '(no body)' && !trimmed.startsWith('[multipart')) {
      parts.push(`  -d ${JSON.stringify(trimmed)}`)
    }
  }
  parts.push(`  ${JSON.stringify(url)}`)
  return parts.join(' \\\n')
}

// Infer capability from endpoint URL path (mirrors backend logic).
function inferCapabilityFromURL(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('image')) {
    if (lower.includes('edit')) return 'image_edit'
    return 'image'
  }
  if (lower.includes('video')) {
    if (lower.includes('i2v') || lower.includes('image-to-video')) return 'video_i2v'
    return 'video'
  }
  return 'text'
}

// Walk a parsed JSON value and collect base64 image data URIs.
function walkForBase64(obj: unknown, out: string[]): void {
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/')) out.push(obj)
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walkForBase64(item, out)
    return
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    // OpenAI: { b64_json: "..." }
    if (typeof o.b64_json === 'string' && o.b64_json.length > 100) {
      out.push(`data:image/png;base64,${o.b64_json}`)
      return
    }
    // Anthropic: { type: "base64", media_type: "image/png", data: "..." }
    if (o.type === 'base64' && typeof o.data === 'string' && o.data.length > 100) {
      const mime = typeof o.media_type === 'string' ? o.media_type : 'image/png'
      out.push(`data:${mime};base64,${o.data}`)
      return
    }
    // Gemini: { inlineData: { mimeType: "image/png", data: "..." } }
    if (o.inlineData && typeof o.inlineData === 'object') {
      const id = o.inlineData as Record<string, unknown>
      if (typeof id.data === 'string' && id.data.length > 100) {
        const mime = typeof id.mimeType === 'string' ? id.mimeType : 'image/png'
        out.push(`data:${mime};base64,${id.data}`)
        return
      }
    }
    for (const val of Object.values(o)) walkForBase64(val, out)
  }
}

function extractBase64Images(jsonStr: string): string[] {
  const images: string[] = []
  try {
    walkForBase64(JSON.parse(jsonStr), images)
  } catch {
    const matches = jsonStr.match(/data:image\/[^"'\s]+/g)
    if (matches) images.push(...matches)
  }
  return [...new Set(images)]
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className={cn('flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors', className)}
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? t('admin.debug.copied') : t('admin.debug.copy')}
    </button>
  )
}

function formatCompactNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

function formatDurationSeconds(value: number | undefined): string {
  if (!value || value < 0) return '-'
  if (value < 60) return `${Math.round(value)}s`
  if (value < 3600) return `${Math.round(value / 60)}m`
  return `${(value / 3600).toFixed(1)}h`
}

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

function modelConfigLabel(cfg: LLMCallLog['ai_model_config'], fallbackId: number): string {
  if (!cfg) return `#${fallbackId}`
  return cfg.short_name || cfg.custom_display_name || cfg.model_id_override || cfg.model_def_id || `#${cfg.ID}`
}

function formatLLMJSON(raw?: string): string {
  if (!raw) return ''
  return tryFormatJSON(raw)
}

const LLM_CALL_PAGE_SIZE = 50

type LLMCallSummary = {
  total: number
  success: number
  errors: number
  error_rate: number
  avg_latency_ms: number
  input_tokens: number
  output_tokens: number
  recent_errors: LLMCallLog[]
}

type LLMCallSettings = {
  retention_days: number
}

type LLMCallFilters = {
  status: string
  operationType: string
  provider: string
  promptName: string
  modelConfigId: string
  credentialId: string
  userId: string
  orgId: string
  projectId: string
  gatewayApiKeyId: string
  since: string
  until: string
  includeExpired: boolean
  expiredOnly: boolean
}

const emptyLLMCallFilters: LLMCallFilters = {
  status: '',
  operationType: '',
  provider: '',
  promptName: '',
  modelConfigId: '',
  credentialId: '',
  userId: '',
  orgId: '',
  projectId: '',
  gatewayApiKeyId: '',
  since: '',
  until: '',
  includeExpired: false,
  expiredOnly: false,
}

function LLMCallLogsSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<LLMCallFilters>(emptyLLMCallFilters)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [retentionDays, setRetentionDays] = useState('14')

  const queryParams = useMemo(() => ({
    page,
    page_size: LLM_CALL_PAGE_SIZE,
    status: filters.status || undefined,
    operation_type: filters.operationType || undefined,
    provider: filters.provider || undefined,
    prompt_name: filters.promptName.trim() || undefined,
    model_config_id: filters.modelConfigId.trim() || undefined,
    credential_id: filters.credentialId.trim() || undefined,
    user_id: filters.userId.trim() || undefined,
    org_id: filters.orgId.trim() || undefined,
    project_id: filters.projectId.trim() || undefined,
    gateway_api_key_id: filters.gatewayApiKeyId.trim() || undefined,
    since: toRFC3339(filters.since),
    until: toRFC3339(filters.until, true),
    include_expired: filters.includeExpired ? 'true' : undefined,
    expired_only: filters.expiredOnly ? 'true' : undefined,
  }), [filters, page])

  const summaryParams = useMemo(() => ({ ...queryParams, page: undefined, page_size: undefined }), [queryParams])

  const logsQuery = useQuery<PaginatedResponse<LLMCallLog>>({
    queryKey: ['admin', 'debug', 'llm-calls', queryParams],
    queryFn: () => api.get('/admin/debug/llm-calls', { params: queryParams }).then((r) => r.data),
    refetchInterval: 15000,
  })
  const summaryQuery = useQuery<LLMCallSummary>({
    queryKey: ['admin', 'debug', 'llm-calls', 'summary', summaryParams],
    queryFn: () => api.get('/admin/debug/llm-calls/summary', { params: summaryParams }).then((r) => r.data),
    refetchInterval: 15000,
  })
  const settingsQuery = useQuery<LLMCallSettings>({
    queryKey: ['admin', 'debug', 'llm-calls', 'settings'],
    queryFn: () => api.get('/admin/debug/llm-calls/settings').then((r) => r.data),
  })
  const settingsMutation = useMutation({
    mutationFn: (payload: LLMCallSettings) => api.put('/admin/debug/llm-calls/settings', payload).then((r) => r.data as LLMCallSettings),
    onSuccess: (settings) => {
      setRetentionDays(String(settings.retention_days))
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'llm-calls', 'settings'] })
    },
  })
  const purgeMutation = useMutation({
    mutationFn: () => api.post('/admin/debug/llm-calls/purge-expired').then((r) => r.data as { deleted: number }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'llm-calls'] })
    },
  })
  const expirationMutation = useMutation({
    mutationFn: ({ id, expiresAt }: { id: number; expiresAt: string }) =>
      api.patch(`/admin/debug/llm-calls/${id}/expiration`, { expires_at: expiresAt }).then((r) => r.data as LLMCallLog),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'llm-calls'] })
    },
  })

  useEffect(() => {
    if (settingsQuery.data && !settingsMutation.isPending) {
      setRetentionDays(String(settingsQuery.data.retention_days))
    }
  }, [settingsQuery.data, settingsMutation.isPending])

  const items = logsQuery.data?.items ?? []
  const total = logsQuery.data?.total ?? 0
  const pageSize = logsQuery.data?.page_size ?? LLM_CALL_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const summary = summaryQuery.data
  const queryError = logsQuery.error || summaryQuery.error || settingsQuery.error
  const isFetching = logsQuery.isFetching || summaryQuery.isFetching

  useEffect(() => {
    if (logsQuery.data && page > pageCount) setPage(pageCount)
  }, [logsQuery.data, page, pageCount])

  function updateFilter<K extends keyof LLMCallFilters>(key: K, value: LLMCallFilters[K]) {
    setFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'expiredOnly' && value === true) next.includeExpired = true
      return next
    })
    setPage(1)
  }

  function refresh() {
    logsQuery.refetch()
    summaryQuery.refetch()
  }

  function saveRetention() {
    settingsMutation.mutate({ retention_days: Number(retentionDays) })
  }

  function updateExpiration(id: number, daysFromNow: number) {
    const next = new Date()
    next.setDate(next.getDate() + daysFromNow)
    expirationMutation.mutate({ id, expiresAt: next.toISOString() })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.debug.llmCalls.title', { defaultValue: 'LLM 调用日志' })}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.debug.llmCalls.description', { defaultValue: '记录每一次文本模型调用，用于排查请求、响应、耗时和错误率。' })}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{t('admin.debug.llmCalls.retentionDays', { defaultValue: '默认保留天数' })}</span>
            <Input value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="h-8 w-24 text-xs" />
          </label>
          <Button type="button" size="sm" onClick={saveRetention} disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => purgeMutation.mutate()} disabled={purgeMutation.isPending}>
            <Trash2 size={13} className="mr-2" />
            {purgeMutation.isPending ? t('common.loadingShort') : t('admin.debug.llmCalls.purgeExpired', { defaultValue: '清理过期' })}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw size={13} className={cn('mr-2', isFetching && 'animate-spin')} />
            {t('admin.debug.system.refresh')}
          </Button>
        </div>
      </div>

      {queryError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(queryError)}
        </div>
      )}
      {settingsMutation.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(settingsMutation.error)}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Activity} label={t('admin.debug.llmCalls.total', { defaultValue: '调用数' })} value={formatCompactNumber(summary?.total)} detail={t('admin.debug.llmCalls.totalDetail', { defaultValue: '当前筛选范围' })} />
        <MetricCard icon={XCircle} label={t('admin.debug.llmCalls.errors', { defaultValue: '错误率' })} value={`${(summary?.error_rate ?? 0).toFixed(1)}%`} detail={`${formatCompactNumber(summary?.errors)} errors`} />
        <MetricCard icon={Clock3} label={t('admin.debug.llmCalls.latency', { defaultValue: '平均耗时' })} value={`${Math.round(summary?.avg_latency_ms ?? 0)}ms`} detail={t('admin.debug.llmCalls.latencyDetail', { defaultValue: 'Provider 调用耗时' })} />
        <MetricCard icon={Zap} label={t('common.tokens')} value={`${formatCompactNumber(summary?.input_tokens)} / ${formatCompactNumber(summary?.output_tokens)}`} detail="input / output" />
        <MetricCard icon={CheckCircle2} label={t('admin.debug.llmCalls.success', { defaultValue: '成功' })} value={formatCompactNumber(summary?.success)} detail={t('admin.debug.llmCalls.successDetail', { defaultValue: '成功完成的调用' })} />
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <FilterInput label={t('admin.debug.llmCalls.status', { defaultValue: '状态' })} value={filters.status} onChange={(value) => updateFilter('status', value)} placeholder="success/error" />
          <FilterInput label={t('admin.debug.llmCalls.operation', { defaultValue: '类型' })} value={filters.operationType} onChange={(value) => updateFilter('operationType', value)} placeholder="text/responses" />
          <FilterInput label="Provider" value={filters.provider} onChange={(value) => updateFilter('provider', value)} placeholder="openai_compat" />
          <FilterInput label="Prompt" value={filters.promptName} onChange={(value) => updateFilter('promptName', value)} />
          <FilterInput label={t('admin.debug.jobs.filters.modelConfigId')} value={filters.modelConfigId} onChange={(value) => updateFilter('modelConfigId', value)} />
          <FilterInput label={t('admin.debug.llmCalls.credentialId', { defaultValue: '凭据 ID' })} value={filters.credentialId} onChange={(value) => updateFilter('credentialId', value)} />
          <FilterInput label={t('admin.debug.jobs.filters.userId')} value={filters.userId} onChange={(value) => updateFilter('userId', value)} />
          <FilterInput label={t('admin.debug.jobs.filters.orgId')} value={filters.orgId} onChange={(value) => updateFilter('orgId', value)} />
          <FilterInput label={t('admin.debug.jobs.filters.projectId')} value={filters.projectId} onChange={(value) => updateFilter('projectId', value)} />
          <FilterInput label="Gateway Key" value={filters.gatewayApiKeyId} onChange={(value) => updateFilter('gatewayApiKeyId', value)} />
          <FilterInput label={t('admin.logs.since', { defaultValue: '开始时间' })} value={filters.since} onChange={(value) => updateFilter('since', value)} type="datetime-local" />
          <FilterInput label={t('admin.logs.until', { defaultValue: '结束时间' })} value={filters.until} onChange={(value) => updateFilter('until', value)} type="datetime-local" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={filters.includeExpired} onChange={(event) => updateFilter('includeExpired', event.target.checked)} />
            {t('admin.debug.llmCalls.includeExpired', { defaultValue: '包含过期' })}
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={filters.expiredOnly} onChange={(event) => updateFilter('expiredOnly', event.target.checked)} />
            {t('admin.debug.llmCalls.expiredOnly', { defaultValue: '只看过期' })}
          </label>
          <button type="button" onClick={() => { setFilters(emptyLLMCallFilters); setPage(1) }} className="text-primary hover:underline">
            {t('admin.logs.clearFilters', { defaultValue: '清空筛选' })}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t('admin.debug.llmCalls.time', { defaultValue: '时间' })}</th>
                <th className="px-3 py-2 font-medium">{t('admin.debug.llmCalls.model', { defaultValue: '模型' })}</th>
                <th className="px-3 py-2 font-medium">Prompt</th>
                <th className="px-3 py-2 font-medium">{t('admin.debug.llmCalls.status', { defaultValue: '状态' })}</th>
                <th className="px-3 py-2 font-medium">{t('common.tokens')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.debug.llmCalls.latency', { defaultValue: '耗时' })}</th>
                <th className="px-3 py-2 font-medium">{t('admin.debug.llmCalls.expiresAt', { defaultValue: '过期时间' })}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const expanded = expandedId === item.ID
                return (
                  <tr key={item.ID} className="align-top">
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(item.CreatedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{modelConfigLabel(item.ai_model_config, item.ai_model_config_id)}</div>
                      <div className="mt-0.5 text-muted-foreground">{item.provider || '-'} · #{item.ai_model_config_id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-[180px] truncate text-foreground">{item.prompt_name || '-'}</div>
                      <div className="text-muted-foreground">{item.operation_type}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', item.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300')}>
                        {item.status}
                      </span>
                      {item.error && <div className="mt-1 max-w-[220px] truncate text-destructive">{item.error}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.input_tokens.toLocaleString()} / {item.output_tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.latency_ms}ms</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(item.expires_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setExpandedId(expanded ? null : item.ID)}>
                        {expanded ? t('common.collapse') : t('common.details')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {!logsQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {t('admin.debug.llmCalls.empty', { defaultValue: '暂无模型调用日志' })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {expandedId && (
          <div className="border-t border-border bg-muted/20 p-3">
            {items.filter((item) => item.ID === expandedId).map((item) => (
              <div key={item.ID} className="grid gap-3 lg:grid-cols-2">
                <DebugJSONPanel title={t('admin.debug.llmCalls.request', { defaultValue: '请求' })} raw={formatLLMJSON(item.request_json)} />
                <div className="space-y-3">
                  <DebugJSONPanel title={t('admin.debug.llmCalls.response', { defaultValue: '响应 / 错误' })} raw={item.error || formatLLMJSON(item.response_json)} />
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span>{t('admin.debug.llmCalls.expirationActions', { defaultValue: '过期管理' })}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateExpiration(item.ID, 7)} disabled={expirationMutation.isPending}>
                      {t('admin.debug.llmCalls.extendSevenDays', { defaultValue: '延长 7 天' })}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateExpiration(item.ID, 30)} disabled={expirationMutation.isPending}>
                      {t('admin.debug.llmCalls.extendThirtyDays', { defaultValue: '延长 30 天' })}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => updateExpiration(item.ID, 0)} disabled={expirationMutation.isPending}>
                      {t('admin.debug.llmCalls.expireNow', { defaultValue: '立即过期' })}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PaginationControls page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPageChange={setPage} />
    </div>
  )
}

function FilterInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </label>
  )
}

function DebugJSONPanel({ title, raw }: { title: string; raw: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        {raw && <CopyButton text={raw} />}
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-xs text-muted-foreground">{raw || '-'}</pre>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-muted text-muted-foreground',
  running:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  succeeded: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

type HTTPMetricsSnapshot = {
  started_at: string
  generated_at: string
  requests: number
  errors: number
  routes: HTTPRouteSnapshot[]
  slow_requests: SlowHTTPRequest[]
  summary?: {
    route_count?: number
    slow_threshold_ms?: number
    uptime_seconds?: number
  }
}

type HTTPRouteSnapshot = {
  method: string
  route: string
  requests: number
  errors: number
  status_counts: Record<string, number>
  latency_ms: { min: number; max: number; avg: number }
}

type SlowHTTPRequest = {
  method: string
  route: string
  path: string
  status: number
  latency_ms: number
  at: string
}

type JobStats = {
  total: number
  by_status: { status: string; count: number }[]
  recent_failed: JobDetail[]
}

type SystemHealthSnapshot = {
  status: 'ok' | 'warning' | 'critical'
  metrics: {
    requests: number
    errors: number
    error_rate: number
    failed_jobs: number
    slow_requests: number
    uptime_seconds: number
  }
  thresholds: {
    error_rate_warn: number
    error_rate_critical: number
    failed_jobs_warn: number
    failed_jobs_critical: number
    slow_requests_warn: number
    slow_requests_critical: number
  }
  issues: Array<{ key: string; severity: 'warning' | 'critical'; value: number; threshold: number }>
}

type SystemHealthThresholds = SystemHealthSnapshot['thresholds']

type HealthThresholdDraft = {
  errorRateWarn: string
  errorRateCritical: string
  failedJobsWarn: string
  failedJobsCritical: string
  slowRequestsWarn: string
  slowRequestsCritical: string
}

const DEFAULT_HEALTH_THRESHOLD_DRAFT: HealthThresholdDraft = {
  errorRateWarn: '5',
  errorRateCritical: '20',
  failedJobsWarn: '1',
  failedJobsCritical: '10',
  slowRequestsWarn: '5',
  slowRequestsCritical: '20',
}

function thresholdsToDraft(thresholds?: SystemHealthThresholds): HealthThresholdDraft {
  if (!thresholds) return DEFAULT_HEALTH_THRESHOLD_DRAFT
  return {
    errorRateWarn: String(thresholds.error_rate_warn),
    errorRateCritical: String(thresholds.error_rate_critical),
    failedJobsWarn: String(thresholds.failed_jobs_warn),
    failedJobsCritical: String(thresholds.failed_jobs_critical),
    slowRequestsWarn: String(thresholds.slow_requests_warn),
    slowRequestsCritical: String(thresholds.slow_requests_critical),
  }
}

function draftToThresholds(draft: HealthThresholdDraft): SystemHealthThresholds {
  return {
    error_rate_warn: Number(draft.errorRateWarn || 0),
    error_rate_critical: Number(draft.errorRateCritical || 0),
    failed_jobs_warn: Number(draft.failedJobsWarn || 0),
    failed_jobs_critical: Number(draft.failedJobsCritical || 0),
    slow_requests_warn: Number(draft.slowRequestsWarn || 0),
    slow_requests_critical: Number(draft.slowRequestsCritical || 0),
  }
}

function SystemOverviewSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [healthThresholds, setHealthThresholds] = useState<HealthThresholdDraft>(DEFAULT_HEALTH_THRESHOLD_DRAFT)
  const metricsQuery = useQuery<HTTPMetricsSnapshot>({
    queryKey: ['admin', 'debug', 'metrics'],
    queryFn: () => api.get('/admin/debug/metrics').then((r) => r.data),
    refetchInterval: 15000,
  })
  const jobStatsQuery = useQuery<JobStats>({
    queryKey: ['admin', 'debug', 'job-stats'],
    queryFn: () => api.get('/admin/debug/job-stats').then((r) => r.data),
    refetchInterval: 15000,
  })
  const healthSettingsQuery = useQuery<SystemHealthThresholds>({
    queryKey: ['admin', 'debug', 'health-settings'],
    queryFn: () => api.get('/admin/debug/health-settings').then((r) => r.data),
  })
  const healthQuery = useQuery<SystemHealthSnapshot>({
    queryKey: ['admin', 'debug', 'health'],
    queryFn: () => api.get('/admin/debug/health').then((r) => r.data),
    refetchInterval: 15000,
  })
  const healthSettingsMutation = useMutation({
    mutationFn: (payload: SystemHealthThresholds) => api.put('/admin/debug/health-settings', payload).then((r) => r.data as SystemHealthThresholds),
    onSuccess: (thresholds) => {
      setHealthThresholds(thresholdsToDraft(thresholds))
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'health-settings'] })
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'health'] })
    },
  })

  useEffect(() => {
    if (healthSettingsQuery.data && !healthSettingsMutation.isPending) {
      setHealthThresholds(thresholdsToDraft(healthSettingsQuery.data))
    }
  }, [healthSettingsQuery.data, healthSettingsMutation.isPending])

  const metrics = metricsQuery.data
  const jobStats = jobStatsQuery.data
  const health = healthQuery.data
  const routeRows = (metrics?.routes ?? []).slice(0, 8)
  const slowRequests = (metrics?.slow_requests ?? []).slice(0, 6)
  const statusCounts = new Map((jobStats?.by_status ?? []).map((item) => [item.status, item.count]))
  const requests = metrics?.requests ?? 0
  const errors = metrics?.errors ?? 0
  const errorRate = requests > 0 ? (errors / requests) * 100 : 0
  const failedJobs = statusCounts.get('failed') ?? 0
  const isRefreshing = metricsQuery.isFetching || jobStatsQuery.isFetching || healthQuery.isFetching || healthSettingsQuery.isFetching

  function refresh() {
    metricsQuery.refetch()
    jobStatsQuery.refetch()
    healthQuery.refetch()
    healthSettingsQuery.refetch()
  }

  function updateHealthThreshold<K extends keyof HealthThresholdDraft>(key: K, value: string) {
    setHealthThresholds((current) => ({ ...current, [key]: value }))
  }

  function saveHealthThresholds() {
    healthSettingsMutation.mutate(draftToThresholds(healthThresholds))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.debug.system.title')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.debug.system.description')}</p>
        </div>
        <button onClick={refresh} disabled={isRefreshing} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          {t('admin.debug.system.refresh')}
        </button>
      </div>

      <div className={cn(
        'rounded-lg border bg-card p-4',
        health?.status === 'critical' ? 'border-destructive/40' : health?.status === 'warning' ? 'border-amber-500/40' : 'border-border',
      )}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                health?.status === 'critical'
                  ? 'bg-destructive/10 text-destructive'
                  : health?.status === 'warning'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400',
              )}>
                {t(`admin.debug.system.healthStatus.${health?.status ?? 'ok'}`)}
              </span>
              <p className="text-sm font-medium text-foreground">{t('admin.debug.system.healthTitle')}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{t('admin.debug.system.healthMetric.errorRate', { value: (health?.metrics.error_rate ?? errorRate).toFixed(1) })}</span>
              <span>{t('admin.debug.system.healthMetric.failedJobs', { value: health?.metrics.failed_jobs ?? failedJobs })}</span>
              <span>{t('admin.debug.system.healthMetric.slowRequests', { value: health?.metrics.slow_requests ?? slowRequests.length })}</span>
            </div>
            {(health?.issues ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {health?.issues.map((issue) => (
                  <span key={`${issue.key}:${issue.severity}`} className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground">
                    {t(`admin.debug.system.healthIssues.${issue.key}`)} · {t(`admin.debug.system.healthSeverity.${issue.severity}`)} · {issue.value.toFixed(issue.key === 'error_rate' ? 1 : 0)} / {issue.threshold}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-2 xl:w-[520px]">
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.errorRateWarn')}
                value={healthThresholds.errorRateWarn}
                onChange={(value) => updateHealthThreshold('errorRateWarn', value)}
                suffix="%"
              />
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.failedJobsWarn')}
                value={healthThresholds.failedJobsWarn}
                onChange={(value) => updateHealthThreshold('failedJobsWarn', value)}
              />
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.slowRequestsWarn')}
                value={healthThresholds.slowRequestsWarn}
                onChange={(value) => updateHealthThreshold('slowRequestsWarn', value)}
              />
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.errorRateCritical')}
                value={healthThresholds.errorRateCritical}
                onChange={(value) => updateHealthThreshold('errorRateCritical', value)}
                suffix="%"
              />
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.failedJobsCritical')}
                value={healthThresholds.failedJobsCritical}
                onChange={(value) => updateHealthThreshold('failedJobsCritical', value)}
              />
              <HealthThresholdInput
                label={t('admin.debug.system.thresholds.slowRequestsCritical')}
                value={healthThresholds.slowRequestsCritical}
                onChange={(value) => updateHealthThreshold('slowRequestsCritical', value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={saveHealthThresholds} disabled={healthSettingsMutation.isPending || healthSettingsQuery.isLoading}>
                {healthSettingsMutation.isPending ? t('admin.debug.system.savingThresholds') : t('admin.debug.system.saveThresholds')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Activity}
          label={t('admin.debug.system.requests')}
          value={formatCompactNumber(requests)}
          detail={t('admin.debug.system.errorRate', { rate: errorRate.toFixed(1) })}
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('admin.debug.system.errors')}
          value={formatCompactNumber(errors)}
          detail={t('admin.debug.system.slowRequests', { count: slowRequests.length })}
          tone={errors > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          icon={Clock3}
          label={t('admin.debug.system.uptime')}
          value={formatDurationSeconds(metrics?.summary?.uptime_seconds)}
          detail={t('admin.debug.system.slowThreshold', { ms: Math.round(metrics?.summary?.slow_threshold_ms ?? 0) })}
        />
        <MetricCard
          icon={Server}
          label={t('admin.debug.system.jobs')}
          value={formatCompactNumber(jobStats?.total)}
          detail={t('admin.debug.system.failedJobs', { count: failedJobs })}
          tone={failedJobs > 0 ? 'warning' : 'default'}
        />
      </div>

      {(metricsQuery.error || jobStatsQuery.error || healthQuery.error || healthSettingsQuery.error || healthSettingsMutation.error) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(metricsQuery.error || jobStatsQuery.error || healthQuery.error || healthSettingsQuery.error || healthSettingsMutation.error)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">{t('admin.debug.system.slowestRoutes')}</p>
          </div>
          {routeRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.debug.system.emptyMetrics')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">{t('admin.debug.system.route')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('admin.debug.system.requests')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('admin.debug.system.errors')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('admin.debug.system.maxLatency')}</th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.map((route) => (
                    <tr key={`${route.method}:${route.route}`} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{route.method}</span>
                          <span className="truncate font-mono text-xs text-foreground">{route.route}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatCompactNumber(route.requests)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatCompactNumber(route.errors)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{Math.round(route.latency_ms.max)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">{t('admin.debug.system.jobBreakdown')}</p>
            </div>
            <div className="space-y-2 p-4">
              {['pending', 'running', 'succeeded', 'failed', 'cancelled'].map((status) => {
                const count = statusCounts.get(status) ?? 0
                const percent = jobStats?.total ? Math.round((count / jobStats.total) * 100) : 0
                return (
                  <a
                    key={status}
                    href={jobStatusHref(status)}
                    className="block space-y-1 rounded-md px-2 py-1 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_COLOR[status])}>
                        {t(`pages.jobs.status.${status}`, { defaultValue: status })}
                      </span>
                      <span className="font-mono text-muted-foreground">{formatCompactNumber(count)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                    </div>
                  </a>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">{t('admin.debug.system.slowSamples')}</p>
            </div>
            <div className="divide-y divide-border">
              {slowRequests.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.debug.system.emptyMetrics')}</p>
              ) : slowRequests.map((sample) => (
                <div key={`${sample.at}:${sample.method}:${sample.path}`} className="px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-foreground">{sample.method} {sample.route || sample.path}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{Math.round(sample.latency_ms)}ms</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground">
                    <span>{sample.status}</span>
                    <span>{formatDateTime(sample.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">{t('admin.debug.system.recentFailures')}</p>
        </div>
        <div className="divide-y divide-border">
          {(jobStats?.recent_failed ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.debug.jobs.empty')}</p>
          ) : jobStats?.recent_failed.map((job) => (
            <div key={job.ID} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[80px_110px_minmax(0,1fr)_auto_auto] md:items-center">
              <span className="font-mono text-muted-foreground">#{job.ID}</span>
              <span className={cn('w-fit rounded-full px-2 py-0.5 font-medium', STATUS_COLOR[job.status] ?? 'bg-muted text-muted-foreground')}>
                {t(`pages.jobs.status.${job.status}`, { defaultValue: job.status })}
              </span>
              <span className="min-w-0 truncate text-foreground">{job.error_msg || job.prompt || t('admin.debug.noPrompt')}</span>
              <span className="font-mono text-muted-foreground">{formatDateTime(job.UpdatedAt || job.CreatedAt)}</span>
              <div className="flex flex-wrap justify-start gap-1 md:justify-end">
                <a href={jobMonitorHref(job)} className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground">
                  {t('admin.debug.jobs.openInMonitor')}
                </a>
                <a href={jobAuditHref(job)} className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground">
                  {t('admin.debug.jobs.viewAuditLogs')}
                </a>
                <a href={jobUsageHref(job)} className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground">
                  {t('admin.debug.jobs.viewUsageLogs')}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HealthThresholdInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 text-xs"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'default' }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: 'default' | 'warning' | 'danger' }) {
  return (
    <div className={cn(
      'rounded-lg border bg-card p-4',
      tone === 'danger' ? 'border-destructive/30' : tone === 'warning' ? 'border-amber-500/30' : 'border-border',
    )}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon size={15} className={cn(tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-500' : 'text-muted-foreground')} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

const STATE_LABEL_KEYS: Record<string, string> = {
  claimed: 'admin.debug.states.claimed',
  resolving_inputs: 'admin.debug.states.resolvingInputs',
  loading_inputs: 'admin.debug.states.loadingInputs',
  preparing_request: 'admin.debug.states.preparingRequest',
  calling_provider: 'admin.debug.states.callingProvider',
  validating_provider_data: 'admin.debug.states.validatingProviderData',
  saving_result: 'admin.debug.states.savingResult',
  persisting_success: 'admin.debug.states.persistingSuccess',
  succeeded: 'admin.debug.states.succeeded',
  failed: 'admin.debug.states.failed',
}

function parseStateTrace(trace?: string): JobStateTraceEntry[] {
  if (!trace) return []
  try {
    const parsed = JSON.parse(trace)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function StateTimeline({ trace }: { trace: JobStateTraceEntry[] }) {
  const { t } = useTranslation()
  if (trace.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('admin.debug.noStateTrace')}</p>
  }
  return (
    <div className="space-y-2">
      {trace.map((entry, index) => {
        const isRunning = entry.status === 'running'
        const isFailed = entry.status === 'failed'
        const Icon = isFailed ? XCircle : isRunning ? PlayCircle : CheckCircle2
        return (
          <div key={`${entry.state}-${index}`} className="grid grid-cols-[18px_1fr_auto] gap-2 text-xs">
            <div className="pt-0.5">
              <Icon size={14} className={cn(isFailed ? 'text-red-500' : isRunning ? 'text-blue-500 animate-pulse' : 'text-green-500')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-foreground">{STATE_LABEL_KEYS[entry.state] ? t(STATE_LABEL_KEYS[entry.state]) : entry.state}</span>
                <span className="font-mono text-muted-foreground truncate">{entry.state}</span>
              </div>
              {(entry.message || entry.error) && (
                <p className={cn('mt-0.5 break-all', entry.error ? 'text-destructive' : 'text-muted-foreground')}>
                  {entry.error || entry.message}
                </p>
              )}
            </div>
            <div className="text-right text-muted-foreground font-mono">
              {entry.duration_ms !== undefined ? `${entry.duration_ms}ms` : isRunning ? 'running' : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getDebugCalls(debug: DebugCallResult): DebugHTTPExchange[] {
  if (debug.calls && debug.calls.length > 0) return debug.calls
  if (debug.endpoint || debug.error) return [debug]
  return []
}

function debugPromptText(debug?: Pick<DebugHTTPExchange, 'compiled_prompt' | 'system_prompt' | 'user_prompt' | 'prompt_messages'> | null): string {
  if (!debug) return ''
  if (debug.compiled_prompt?.trim()) return debug.compiled_prompt
  if (debug.prompt_messages?.length) {
    return debug.prompt_messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n')
  }
  return [
    debug.system_prompt ? `[system]\n${debug.system_prompt}` : '',
    debug.user_prompt ? `[user]\n${debug.user_prompt}` : '',
  ].filter(Boolean).join('\n\n')
}

function PromptDebugBlock({ debug }: { debug: Pick<DebugHTTPExchange, 'prompt_name' | 'compiled_prompt' | 'system_prompt' | 'user_prompt' | 'prompt_messages'> }) {
  const prompt = debugPromptText(debug)
  if (!prompt) return null
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-muted-foreground font-sans">Prompt{debug.prompt_name ? ` · ${debug.prompt_name}` : ''}</p>
        <CopyButton text={prompt} />
      </div>
      <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-80">
        {prompt}
      </pre>
    </div>
  )
}

function HttpExchange({ method, url, headers, body, promptName, systemPrompt, userPrompt, compiledPrompt, promptMessages, responseStatus, responseBody, latencyMs, error }: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  promptName?: string
  systemPrompt?: string
  userPrompt?: string
  compiledPrompt?: string
  promptMessages?: Array<{ role: string; content: string }>
  responseStatus?: number
  responseBody?: string
  latencyMs?: number
  error?: string
}) {
  const { t } = useTranslation()
  const curlCmd = (method && url && headers)
    ? buildCurlCommand(method, url, headers, body)
    : null

  const b64Images = responseBody ? extractBase64Images(responseBody) : []

  return (
    <div className="space-y-2 text-xs font-mono">
      {(responseStatus !== undefined || latencyMs !== undefined) && (
        <div className="flex items-center gap-2">
          {responseStatus !== undefined && responseStatus > 0 && (
            <span className={cn('px-1.5 py-0.5 rounded font-medium', responseStatus < 400 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
              HTTP {responseStatus}
            </span>
          )}
          {latencyMs !== undefined && <span className="text-muted-foreground">{latencyMs}ms</span>}
          {error && <span className="text-destructive truncate">{error}</span>}
        </div>
      )}

      <PromptDebugBlock debug={{ prompt_name: promptName, system_prompt: systemPrompt, user_prompt: userPrompt, compiled_prompt: compiledPrompt, prompt_messages: promptMessages }} />

      {headers && Object.keys(headers).length > 0 && (
        <div>
          <p className="text-muted-foreground font-sans mb-0.5">{t('admin.debug.requestHeaders')}</p>
          <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-32">
            {Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
          </pre>
        </div>
      )}

      {body && body !== '(no body)' && (
        <div>
          <p className="text-muted-foreground font-sans mb-0.5">{t('admin.debug.requestBody')}</p>
          <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
            {tryFormatJSON(body)}
          </pre>
        </div>
      )}

      {curlCmd && (
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-muted-foreground font-sans">{t('admin.debug.curlCommand')}</p>
            <CopyButton text={curlCmd} />
          </div>
          <pre className="bg-zinc-900 text-zinc-100 dark:bg-zinc-950 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
            {curlCmd}
          </pre>
        </div>
      )}

      {responseBody && (
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-muted-foreground font-sans">{t('admin.debug.responseBody')}</p>
            <CopyButton text={tryFormatJSON(responseBody)} />
          </div>
          <pre className={cn('rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-60', (responseStatus ?? 0) < 400 ? 'bg-muted' : 'bg-red-50 dark:bg-red-900/10')}>
            {tryFormatJSON(responseBody)}
          </pre>
        </div>
      )}

      {b64Images.length > 0 && (
        <div>
          <p className="text-muted-foreground font-sans mb-1.5">{t('admin.debug.imagePreview', { count: b64Images.length })}</p>
          <div className="flex flex-wrap gap-2">
            {b64Images.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noreferrer">
                <img
                  src={src}
                  alt={t('admin.debug.generatedImageAlt', { number: i + 1 })}
                  className="max-h-64 max-w-xs rounded border border-border object-contain bg-muted/30 hover:opacity-90 transition-opacity"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section 1: Raw API Call ───────────────────────────────────────────────────

function RawCallSection() {
  const { t } = useTranslation()
  const [credId, setCredId] = useState<string>('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('POST')
  const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}')
  const [body, setBody] = useState('{\n  \n}')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RawCallResult | null>(null)

  const { data: credentials = [] } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  async function send() {
    let headers: Record<string, string> = {}
    try { headers = JSON.parse(headersText) } catch { /* ignore */ }

    setLoading(true)
    setResult(null)
    try {
      const res: RawCallResult = await api.post('/admin/debug/raw-call', {
        credential_id: credId ? Number(credId) : undefined,
        url,
        method,
        headers,
        body: method === 'GET' ? '' : body,
      }).then((r) => r.data)
      setResult(res)
    } catch (e: unknown) {
      const msg = translateApiError((e as any)?.response?.data)
      setResult({ url, method, request_headers: {}, request_body: body, response_status: 0, response_body: '', latency_ms: 0, error: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t('admin.debug.rawCall.title')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('admin.debug.rawCall.description')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('admin.debug.rawCall.credentialLabel')}</Label>
          <select
            value={credId}
            onChange={(e) => setCredId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('admin.debug.rawCall.noCredential')}</option>
            {credentials.map((c) => (
              <option key={c.ID} value={c.ID}>{c.display_name} ({c.adapter_type})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('common.method')}</Label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {['GET', 'POST', 'PUT', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t('common.url')}</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/v1/..." className="font-mono text-xs" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('admin.debug.requestHeadersJson')}</Label>
          <textarea
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('admin.debug.requestBodyJson')}</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y"
          />
        </div>
      </div>

      <Button onClick={send} disabled={loading || !url} size="sm" className="gap-1.5">
        <Send size={13} />
        {loading ? t('admin.debug.rawCall.sending') : t('admin.debug.rawCall.send')}
      </Button>

      {result && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-2">
          <p className="text-xs font-medium text-foreground font-mono">{result.method} {result.url}</p>
          <HttpExchange
            method={result.method}
            url={result.url}
            headers={result.request_headers}
            body={result.request_body}
            responseStatus={result.response_status}
            responseBody={result.response_body}
            latencyMs={result.latency_ms}
            error={result.error}
          />
        </div>
      )}
    </div>
  )
}

// ── Section 2: Job Monitor ────────────────────────────────────────────────────

const JOB_MONITOR_PAGE_SIZE = 25

function jobUsageHref(job: JobDetail): string {
  return adminHref(usageLogsHref({
    userId: job.user_id,
    orgId: job.org_id,
    projectId: job.project_id,
  }))
}

function jobMonitorHref(job: JobDetail): string {
  return adminHref(`/debug?tab=jobs&job_id=${job.ID}`)
}

function jobAuditHref(job: JobDetail): string {
  return adminHref(auditLogsHref({ targetType: 'job', targetId: job.ID }))
}

function jobStatusHref(status: string): string {
  return adminHref(`/debug?${jobUrlSearchParams({ ...emptyJobMonitorFilters, status }, 1).toString()}`)
}

function isVideoJobType(jobType: string): boolean {
  return jobType === 'video' || jobType === 'video_i2v' || jobType === 'video_v2v'
}

function JobMonitorSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<JobMonitorFilters>(() => jobFiltersFromSearchParams(searchParams))
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [page, setPage] = useState(() => jobMonitorPageFromSearchParams(searchParams))
  const [jobActionError, setJobActionError] = useState('')

  useEffect(() => {
    setFilters(jobFiltersFromSearchParams(searchParams))
    setPage(jobMonitorPageFromSearchParams(searchParams))
  }, [searchParams])

  const { data, refetch, isFetching } = useQuery<{ jobs: JobDetail[]; total: number }>({
    queryKey: ['admin', 'debug', 'jobs', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(JOB_MONITOR_PAGE_SIZE),
        offset: String((page - 1) * JOB_MONITOR_PAGE_SIZE),
      })
      const filterParams = jobSearchParams(filters, 1)
      filterParams.delete('page')
      filterParams.forEach((value, key) => params.set(key, value))
      const res = await api.get<JobDetail[]>(`/admin/debug/jobs?${params.toString()}`)
      const total = Number(res.headers['x-total-count'] ?? res.data.length)
      return { jobs: res.data, total }
    },
    refetchInterval: autoRefresh ? 3000 : false,
  })
  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / JOB_MONITOR_PAGE_SIZE))

  const jobAction = useMutation({
    mutationFn: async ({ job, action }: { job: JobDetail; action: AdminJobAction }) => {
      if (action === 'delete') {
        await api.delete(`/admin/debug/jobs/${job.ID}`)
        return null
      }
      return api.post(`/admin/debug/jobs/${job.ID}/${action}`, {}).then((r) => r.data)
    },
    onMutate: () => setJobActionError(''),
    onSuccess: (_result, variables) => {
      setJobActionError('')
      if (variables.action === 'delete') {
        setExpandedId((current) => current === variables.job.ID ? null : current)
      }
      qc.invalidateQueries({ queryKey: ['admin', 'debug', 'jobs'] })
    },
    onError: (err: unknown) => setJobActionError(translateAPIRequestError(err)),
  })

  const pendingActionKey = jobAction.isPending && jobAction.variables
    ? `${jobAction.variables.action}:${jobAction.variables.job.ID}`
    : ''

  function runJobAction(event: MouseEvent<HTMLButtonElement>, job: JobDetail, action: AdminJobAction) {
    event.stopPropagation()
    if (!window.confirm(t(jobActionConfirmKey(action), { id: job.ID }))) {
      return
    }
    jobAction.mutate({ job, action })
  }

  useEffect(() => {
    if (page > pageCount) updatePage(pageCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount])

  function updateFilter<K extends keyof JobMonitorFilters>(key: K, value: JobMonitorFilters[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    setPage(1)
    setSearchParams(jobUrlSearchParams(next, 1), { replace: true })
  }

  function clearFilters() {
    setFilters(emptyJobMonitorFilters)
    setPage(1)
    setSearchParams(jobUrlSearchParams(emptyJobMonitorFilters, 1), { replace: true })
  }

  function updatePage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage))
    setPage(normalized)
    setSearchParams(jobUrlSearchParams(filters, normalized), { replace: true })
  }

  const hasFilters = Object.values(filters).some((value) => value.trim() !== '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.debug.jobs.title')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.debug.jobs.description', { total })}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded" />
            {t('admin.debug.jobs.autoRefresh')}
          </label>
          <button onClick={() => refetch()} disabled={isFetching} className="p-1.5 rounded hover:bg-muted transition-colors">
            <RefreshCw size={13} className={cn('text-muted-foreground', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {['', 'pending', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => updateFilter('status', s)}
            className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors', filters.status === s ? 'border-ring bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {s === '' ? t('common.all') : t(`pages.jobs.status.${s}`, { defaultValue: s })}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <JobFilterField label={t('admin.debug.jobs.filters.jobId')} value={filters.jobId} onChange={(value) => updateFilter('jobId', value.replace(/\D/g, ''))} placeholder="1024" />
          <JobFilterField label={t('admin.debug.jobs.filters.userId')} value={filters.userId} onChange={(value) => updateFilter('userId', value.replace(/\D/g, ''))} placeholder="42" />
          <JobFilterField label={t('admin.debug.jobs.filters.orgId')} value={filters.orgId} onChange={(value) => updateFilter('orgId', value.replace(/\D/g, ''))} placeholder="1" />
          <JobFilterField label={t('admin.debug.jobs.filters.projectId')} value={filters.projectId} onChange={(value) => updateFilter('projectId', value.replace(/\D/g, ''))} placeholder="128" />
          <JobFilterField label={t('admin.debug.jobs.filters.modelConfigId')} value={filters.modelConfigId} onChange={(value) => updateFilter('modelConfigId', value.replace(/\D/g, ''))} placeholder="4" />
          <JobFilterField label={t('admin.debug.jobs.filters.jobType')} value={filters.jobType} onChange={(value) => updateFilter('jobType', value)} placeholder="video_i2v" />
          <JobFilterField label={t('admin.debug.jobs.filters.featureKey')} value={filters.featureKey} onChange={(value) => updateFilter('featureKey', value)} placeholder="ref_video_gen" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters}>
            {t('admin.debug.jobs.clearFilters')}
          </Button>
        </div>
      </div>

      {total > JOB_MONITOR_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('admin.debug.jobs.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => updatePage(page - 1)} disabled={page === 1}>
              {t('admin.logs.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => updatePage(page + 1)} disabled={page === pageCount}>
              {t('admin.logs.nextPage')}
            </Button>
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.debug.jobs.empty')}</p>
      )}

      {jobActionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{jobActionError}</span>
        </div>
      )}

      <div className="space-y-2">
        {jobs.map((job) => {
          const isExpanded = expandedId === job.ID
          const hasDebug = !!job.debug_detail || !!job.debug_info
          const stateTrace = parseStateTrace(job.state_trace)
          const canRetry = job.status === 'failed' || job.status === 'cancelled'
          const canCancel = (job.status === 'pending' || job.status === 'running') && isVideoJobType(job.job_type)
          const canDelete = job.status !== 'running'
          return (
            <div key={job.ID} className="border border-border rounded-lg bg-background overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : job.ID)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">#{job.ID}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_COLOR[job.status] ?? 'bg-muted text-muted-foreground')}>
                      {t(`pages.jobs.status.${job.status}`, { defaultValue: job.status })}
                    </span>
                    {job.execution_state && (
                      <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                        {STATE_LABEL_KEYS[job.execution_state] ? t(STATE_LABEL_KEYS[job.execution_state]) : job.execution_state}
                      </span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">{job.job_type}</span>
                    {hasDebug && <span className="text-xs text-amber-500 flex items-center gap-0.5"><Bug size={10} /> {t('admin.debug.debugMark')}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{job.prompt || t('admin.debug.noPrompt')}</p>
                  {job.error_msg && <p className="text-xs text-destructive mt-0.5 truncate">{job.error_msg}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{new Date(job.CreatedAt).toLocaleString()}</p>
                  {job.provider_task_id && <p className="text-xs font-mono text-muted-foreground/60 truncate max-w-32">{job.provider_task_id}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canRetry && (
                    <button
                      type="button"
                      onClick={(event) => runJobAction(event, job, 'retry')}
                      disabled={jobAction.isPending}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title={t('admin.debug.jobs.retry')}
                      aria-label={t('admin.debug.jobs.retry')}
                    >
                      <RefreshCw size={13} className={cn(pendingActionKey === `retry:${job.ID}` && 'animate-spin')} />
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      onClick={(event) => runJobAction(event, job, 'cancel')}
                      disabled={jobAction.isPending}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                      title={t('admin.debug.jobs.cancel')}
                      aria-label={t('admin.debug.jobs.cancel')}
                    >
                      <XCircle size={13} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(event) => runJobAction(event, job, 'delete')}
                      disabled={jobAction.isPending}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                      title={t('admin.debug.jobs.delete')}
                      aria-label={t('admin.debug.jobs.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
              </div>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 bg-card space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      [t('admin.debug.jobs.fields.jobId'), String(job.ID)],
                      [t('admin.debug.jobs.fields.userId'), `#${job.user_id}`],
                      [t('admin.debug.jobs.fields.orgId'), job.org_id ? `#${job.org_id}` : '—'],
                      [t('admin.debug.jobs.fields.projectId'), job.project_id ? `#${job.project_id}` : '—'],
                      [t('admin.debug.jobs.fields.modelConfigId'), String(job.model_config_id)],
                      [t('admin.debug.jobs.fields.jobType'), job.job_type],
                      [t('admin.debug.jobs.fields.featureKey'), job.feature_key || '—'],
                      [t('admin.debug.jobs.fields.status'), t(`pages.jobs.status.${job.status}`, { defaultValue: job.status })],
                      [t('admin.debug.jobs.fields.executionState'), job.execution_state ? (STATE_LABEL_KEYS[job.execution_state] ? t(STATE_LABEL_KEYS[job.execution_state]) : job.execution_state) : '—'],
                      [t('admin.debug.jobs.fields.providerTaskId'), job.provider_task_id || '—'],
                      [t('admin.debug.jobs.fields.started'), job.started_at ? new Date(job.started_at).toLocaleString() : '—'],
                      [t('admin.debug.jobs.fields.finished'), job.finished_at ? new Date(job.finished_at).toLocaleString() : '—'],
                      [t('admin.debug.jobs.fields.outputResource'), job.output_resource_id ? `#${job.output_resource_id}` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-muted-foreground w-28 shrink-0">{k}</span>
                        <span className="font-mono truncate">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <a className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground" href={jobAuditHref(job)}>
                      {t('admin.debug.jobs.viewAuditLogs')}
                    </a>
                    <a className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:text-foreground" href={jobUsageHref(job)}>
                      {t('admin.debug.jobs.viewUsageLogs')}
                    </a>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">{t('admin.debug.jobs.stateMachine')}</p>
                    <div className="bg-background border border-border rounded-md p-2">
                      <StateTimeline trace={stateTrace} />
                    </div>
                  </div>

                  {job.output_resource && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t('admin.debug.jobs.outputResource')}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono">{job.output_resource.name}</span>
                        <span className="text-muted-foreground">{job.output_resource.type}</span>
                        {job.output_resource.url && (
                          <a href={job.output_resource.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t('admin.debug.view')}</a>
                        )}
                      </div>
                    </div>
                  )}

                  {job.extra_params && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t('admin.params.title')}</p>
                      <pre className="bg-muted rounded p-2 text-xs font-mono overflow-x-auto">
                        {tryFormatJSON(job.extra_params)}
                      </pre>
                    </div>
                  )}

                  {job.debug_detail && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1.5">{t('admin.debug.jobs.debugContext')}</p>
                      <div className="bg-background border border-border rounded-md p-2 mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {[
                          [t('admin.debug.jobs.fields.modelDef'), job.debug_detail.job_model_def_id || '—'],
                          [t('admin.debug.jobs.fields.jobType'), job.debug_detail.job_type || job.job_type],
                          [t('admin.debug.jobs.fields.inputResources'), job.debug_detail.job_input_resource_ids?.length ? job.debug_detail.job_input_resource_ids.map((id) => `#${id}`).join(', ') : '—'],
                          [t('admin.debug.jobs.fields.resolvedPrompt'), job.debug_detail.job_resolved_prompt || job.prompt || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className={cn('flex gap-2', k === t('admin.debug.jobs.fields.resolvedPrompt') && 'col-span-2')}>
                            <span className="text-muted-foreground w-28 shrink-0">{k}</span>
                            <span className="font-mono break-all">{v}</span>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs font-medium text-foreground mb-1.5">{t('admin.debug.jobs.httpExchanges', { count: getDebugCalls(job.debug_detail).length })}</p>
                      <div className="space-y-3">
                        {getDebugCalls(job.debug_detail).map((call, index) => (
                          <div key={`${call.method}-${call.endpoint}-${index}`} className="bg-background border border-border rounded-md p-2">
                            <p className="text-xs font-mono text-muted-foreground mb-1">
                              #{index + 1} {call.method || '—'} {call.endpoint || '—'}
                            </p>
                            <HttpExchange
                              method={call.method}
                              url={call.endpoint}
                              headers={call.request_headers}
                              body={call.request_body}
                              promptName={call.prompt_name}
                              systemPrompt={call.system_prompt}
                              userPrompt={call.user_prompt}
                              compiledPrompt={call.compiled_prompt}
                              promptMessages={call.prompt_messages}
                              responseStatus={call.response_status}
                              responseBody={call.response_body}
                              latencyMs={call.latency_ms}
                              error={call.error}
                            />
                          </div>
                        ))}
                        {getDebugCalls(job.debug_detail).length === 0 && (
                          <p className="text-xs text-muted-foreground">{t('admin.debug.jobs.noProviderCalls')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {!job.debug_detail && job.debug_info && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1.5">{t('admin.debug.jobs.debugInfoRaw')}</p>
                      <pre className="bg-muted rounded p-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-60">
                        {tryFormatJSON(job.debug_info)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JobFilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

// ── Section 3: Model Connectivity Test (existing DebugTab logic) ──────────────


interface ModelDebugState { loading: boolean; result: DebugCallResult | null }

function ModelConnectivitySection() {
  const { t } = useTranslation()
  const [states, setStates] = useState<Record<string, ModelDebugState>>({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const { data: credentials = [] } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  const allModels = credentials.flatMap((cred) =>
    (cred.models ?? []).map((cfg) => ({ cred, cfg }))
  )

  async function runDebug(credId: number, modelId: number, key: string) {
    setStates((s) => ({ ...s, [key]: { loading: true, result: null } }))
    setExpandedKey(key)
    try {
      const result: DebugCallResult = await api.post(`/admin/credentials/${credId}/models/${modelId}/debug`, {}).then((r) => r.data)
      setStates((s) => ({ ...s, [key]: { loading: false, result } }))
    } catch (e: unknown) {
      const msg = translateApiError((e as any)?.response?.data)
      setStates((s) => ({
        ...s,
        [key]: { loading: false, result: { success: false, model_id: '', endpoint: '', method: '', request_body: '', response_status: 0, response_body: '', latency_ms: 0, error: msg } },
      }))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t('admin.debug.connectivity.title')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('admin.debug.connectivity.description')}
          <span className="text-amber-600 dark:text-amber-400 ml-1">{t('admin.debug.connectivity.costWarning')}</span>
        </p>
      </div>

      {allModels.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.debug.connectivity.empty')}</p>
      )}

      <div className="space-y-2">
        {allModels.map(({ cred, cfg }) => {
          const key = `${cred.ID}-${cfg.ID}`
          const state = states[key]
          const isExpanded = expandedKey === key
          const modelID = cfg.model_id_override || cfg.model_def_id

          return (
            <div key={key} className="border border-border rounded-lg bg-background overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{cfg.custom_display_name || cfg.model_def_id}</span>
                    <span className="text-xs text-muted-foreground">{cred.display_name}</span>
                    {cred.base_url && <span className="text-xs font-mono text-muted-foreground/60 truncate max-w-48">{cred.base_url}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{modelID}</p>
                </div>
                <button
                  onClick={() => {
                    if (isExpanded && !state?.loading) setExpandedKey(null)
                    else runDebug(cred.ID, cfg.ID, key)
                  }}
                  disabled={state?.loading}
                  className="text-xs border border-border rounded px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-ring transition-colors disabled:opacity-50 shrink-0"
                >
                  {state?.loading ? t('admin.debug.connectivity.debugging') : t('admin.models.test')}
                </button>
              </div>

              {isExpanded && state && !state.loading && state.result && (
                <div className="border-t border-border px-4 py-3 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', state.result.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
                      {state.result.success ? t('admin.debug.success') : t('admin.debug.failed')}
                    </span>
                    {state.result.response_status > 0 && (
                      <span className={cn('text-xs px-1.5 py-0.5 rounded', state.result.response_status < 400 ? 'bg-muted' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
                        HTTP {state.result.response_status}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{state.result.latency_ms}ms</span>
                    {state.result.error && <span className="text-xs text-destructive truncate">{state.result.error}</span>}
                  </div>
                    <HttpExchange
                      method={state.result.method}
                      url={state.result.endpoint}
                      headers={state.result.request_headers}
                      body={state.result.request_body}
                      promptName={state.result.prompt_name}
                      systemPrompt={state.result.system_prompt}
                      userPrompt={state.result.user_prompt}
                      compiledPrompt={state.result.compiled_prompt}
                      promptMessages={state.result.prompt_messages}
                      responseStatus={state.result.response_status}
                      responseBody={state.result.response_body}
                    latencyMs={state.result.latency_ms}
                    error={state.result.error}
                  />
                </div>
              )}
              {isExpanded && state?.loading && (
                <div className="border-t border-border px-4 py-3 bg-card">
                  <p className="text-xs text-muted-foreground">{t('admin.debug.callingApi')}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Section 4: Provider Sandbox ───────────────────────────────────────────────

const CAPABILITY_LABEL_KEYS: Record<string, string> = {
  text: 'admin.debug.capabilities.text',
  image: 'admin.debug.capabilities.image',
  image_edit: 'admin.capabilities.imageEdit',
  video: 'admin.capabilities.video',
  video_i2v: 'admin.capabilities.videoI2V',
}

// Quick endpoint URL suggestions per adapter type.
const ADAPTER_ENDPOINT_SUGGESTIONS: Record<string, { labelKey: string; url: string }[]> = {
  openai_compat: [
    { labelKey: 'admin.debug.capabilities.text', url: '/v1/chat/completions' },
    { labelKey: 'admin.debug.capabilities.image', url: '/v1/images/generations' },
    { labelKey: 'admin.capabilities.imageEdit', url: '/v1/images/edits' },
  ],
  anthropic: [
    { labelKey: 'admin.debug.capabilities.text', url: 'https://api.anthropic.com/v1/messages' },
  ],
  gemini: [
    { labelKey: 'admin.debug.endpointLabels.geminiText', url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent' },
    { labelKey: 'admin.debug.endpointLabels.geminiImage', url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent' },
    { labelKey: 'admin.debug.endpointLabels.imagenImage', url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:predict' },
    { labelKey: 'admin.debug.endpointLabels.veoVideo', url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:predictLongRunning' },
  ],
  kling: [
    { labelKey: 'admin.debug.capabilities.image', url: 'https://api.klingai.com/v1/images/generations' },
    { labelKey: 'admin.capabilities.video', url: 'https://api.klingai.com/v1/videos/text2video' },
    { labelKey: 'admin.capabilities.videoI2V', url: 'https://api.klingai.com/v1/videos/image2video' },
  ],
  volcen: [
    { labelKey: 'admin.debug.capabilities.text', url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
    { labelKey: 'admin.debug.capabilities.image', url: 'https://ark.cn-beijing.volces.com/api/v3/images/generations' },
    { labelKey: 'admin.capabilities.video', url: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks' },
  ],
}

// Default param schemas for each capability, used in direct debug calls.
const DEFAULT_PARAMS: Record<string, ParamDef[]> = {
  text: [
    { key: 'max_tokens', label: 'admin.debug.params.maxTokens', type: 'number', default: 200000, min: 1, max: 200000 },
    { key: 'temperature', label: 'admin.debug.params.temperature', type: 'number', default: 0.7, min: 0, max: 2, step: 0.1 },
  ],
  image: [
    { key: 'aspect_ratio', label: 'admin.params.templates.aspect_ratio', type: 'select', options: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' },
    { key: 'quality', label: 'admin.params.templates.quality', type: 'select', options: ['auto', 'standard', 'hd', 'high', 'medium', 'low'], default: 'standard' },
  ],
  image_edit: [
    { key: 'aspect_ratio', label: 'admin.params.templates.aspect_ratio', type: 'select', options: ['1:1', '16:9', '9:16'], default: '1:1' },
  ],
  video: [
    { key: 'duration', label: 'admin.params.templates.duration', type: 'select', options: ['5', '6', '8', '10', '15', '20'], default: '5' },
    { key: 'aspect_ratio', label: 'admin.params.templates.aspect_ratio', type: 'select', options: ['16:9', '9:16', '1:1', '4:3', '3:4'], default: '16:9' },
  ],
  video_i2v: [
    { key: 'duration', label: 'admin.params.templates.duration', type: 'select', options: ['5', '6', '8', '10', '15'], default: '5' },
    { key: 'aspect_ratio', label: 'admin.params.templates.aspect_ratio', type: 'select', options: ['16:9', '9:16', '1:1'], default: '16:9' },
  ],
}

function ParamField({ def: p, value, onChange }: { def: ParamDef; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  if (p.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (p.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 h-9">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} className="rounded" />
        <span className="text-sm text-muted-foreground">{t(p.label)}</span>
      </div>
    )
  }
  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={p.min}
      max={p.max}
      step={(p as ParamDef & { step?: number }).step ?? 1}
      className="font-mono text-xs"
    />
  )
}

function ProviderSandboxSection() {
  const { t } = useTranslation()
  const [adapterType, setAdapterType] = useState('openai_compat')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [endpointURL, setEndpointURL] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState(() => t('admin.debug.sandbox.defaultPrompt'))
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [extraParamsText, setExtraParamsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DebugCallResult | null>(null)

  // Debounced preview params — only update after 400ms of inactivity to avoid hammering the backend.
  const [previewParams, setPreviewParams] = useState<object | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: adapters = [] } = useQuery<AdapterDef[]>({
    queryKey: ['admin', 'adapters'],
    queryFn: () => api.get('/admin/adapters').then((r) => r.data),
  })

  const adapterDef = adapters.find((a) => a.adapter_type === adapterType)

  useEffect(() => {
    if (adapterDef?.default_base_url) setBaseURL(adapterDef.default_base_url)
  }, [adapterType, adapterDef?.default_base_url])

  // Infer capability from endpoint URL for param defaults.
  const capability = endpointURL ? inferCapabilityFromURL(endpointURL) : 'text'

  const paramDefs: ParamDef[] = DEFAULT_PARAMS[capability] ?? []

  useEffect(() => {
    const defaults: Record<string, string> = {}
    for (const p of paramDefs) {
      defaults[p.key] = String(p.default ?? '')
    }
    setParamValues(defaults)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability, adapterType, model])

  function setParam(key: string, val: string) {
    setParamValues((prev) => ({ ...prev, [key]: val }))
  }

  function buildParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(paramValues)) {
      const def = paramDefs.find((p) => p.key === k)
      if (!def) continue
      if (def.type === 'number') { const n = parseFloat(v); if (!isNaN(n)) params[k] = n }
      else if (def.type === 'boolean') params[k] = v === 'true'
      else params[k] = v
    }
    if (extraParamsText.trim()) {
      try { Object.assign(params, JSON.parse(extraParamsText)) } catch { /* ignore */ }
    }
    return params
  }

  // Trigger debounced preview fetch whenever form inputs change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewParams({
        adapter_type: adapterType,
        base_url: baseURL,
        api_key: apiKey,
        endpoint_url: endpointURL,
        model,
        prompt,
        params: buildParams(),
        dry_run: true,
      })
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterType, baseURL, apiKey, endpointURL, model, prompt, paramValues, extraParamsText])

  const { data: preview, isFetching: previewLoading } = useQuery<DebugCallResult>({
    queryKey: ['admin', 'debug', 'preview', previewParams],
    queryFn: () => api.post('/admin/debug/provider-call', previewParams).then((r) => r.data),
    enabled: !!previewParams && !!model,
    staleTime: 0,
  })

  const previewCurl = preview
    ? buildCurlCommand(preview.method, preview.endpoint, preview.request_headers ?? {}, preview.request_body)
    : ''

  async function send() {
    setLoading(true)
    setResult(null)
    try {
      const res: DebugCallResult = await api.post('/admin/debug/provider-call', {
        adapter_type: adapterType,
        base_url: baseURL,
        api_key: apiKey,
        endpoint_url: endpointURL,
        model,
        prompt,
        params: buildParams(),
      }).then((r) => r.data)
      setResult(res)
    } catch (e: unknown) {
      const msg = translateApiError((e as any)?.response?.data)
      setResult({ success: false, model_id: model, endpoint: '', method: '', request_body: '', response_status: 0, response_body: '', latency_ms: 0, error: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">{t('admin.debug.sandbox.title')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('admin.debug.sandbox.description')}</p>
      </div>

      {/* ── Two-column: form left, live preview right ── */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* ── Left: form ── */}
        <div className="space-y-3">

          <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <p className="text-xs font-medium text-foreground">{t('admin.debug.sandbox.credentialConfig')}</p>
            <div className="space-y-1">
              <Label className="text-xs">{t('admin.debug.sandbox.adapterType')}</Label>
              <select value={adapterType} onChange={(e) => setAdapterType(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {adapters.map((a) => (
                  <option key={a.adapter_type} value={a.adapter_type}>
                    {t(`admin.adapters.${a.adapter_type}.name`, { defaultValue: a.display_name })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {t('common.endpointUrl')}
                <span className="ml-1.5 text-muted-foreground font-normal">{t('admin.debug.sandbox.endpointHint')}</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input value={endpointURL} onChange={(e) => setEndpointURL(e.target.value)}
                  placeholder={ADAPTER_ENDPOINT_SUGGESTIONS[adapterType]?.[0]?.url ?? 'https://...'}
                  className="font-mono text-xs flex-1" />
                {endpointURL && (
                  <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    {CAPABILITY_LABEL_KEYS[capability] ? t(CAPABILITY_LABEL_KEYS[capability]) : capability}
                  </span>
                )}
              </div>
              {(ADAPTER_ENDPOINT_SUGGESTIONS[adapterType]?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {ADAPTER_ENDPOINT_SUGGESTIONS[adapterType].map((s) => (
                    <button
                      key={s.url}
                      type="button"
                      onClick={() => setEndpointURL(s.url)}
                      className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-ring transition-colors font-mono"
                    >
                      {t(s.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('common.baseUrl')} <span className="text-muted-foreground font-normal">{t('admin.debug.sandbox.baseUrlHint')}</span></Label>
              <Input value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://api.openai.com/v1" className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {t('common.apiKey')}
                {adapterType === 'kling' && <span className="ml-1 text-muted-foreground">{t('admin.debug.sandbox.klingKeyFormat')}</span>}
              </Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={adapterType === 'kling' ? 'access_key:secret_key' : 'sk-...'}
                className="font-mono text-xs" />
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <p className="text-xs font-medium text-foreground">{t('admin.debug.sandbox.requestParams')}</p>
            <div className="space-y-1">
              <Label className="text-xs">{t('admin.debug.sandbox.modelId')}</Label>
              <div className="flex gap-2">
                <Input value={model} onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o" className="font-mono text-xs flex-1" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('common.prompt')}</Label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
            </div>
            {paramDefs.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">{t('admin.params.title')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {paramDefs.map((p) => (
                    <div key={p.key} className="space-y-1">
                      <Label className="text-xs">{t(p.label)}</Label>
                      <ParamField def={p} value={paramValues[p.key] ?? String(p.default ?? '')} onChange={(v) => setParam(p.key, v)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t('admin.debug.sandbox.extraParams')}</Label>
              <textarea value={extraParamsText} onChange={(e) => setExtraParamsText(e.target.value)} rows={3}
                placeholder={'{\n  "reasoning_effort": "high"\n}'}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" />
            </div>
          </div>

          <Button onClick={send} disabled={loading || !model} size="sm" className="gap-1.5">
            <Zap size={13} />
            {loading ? t('admin.debug.sandbox.calling') : t('admin.debug.sandbox.startDebugCall')}
          </Button>
        </div>

        {/* ── Right: live preview + result ── */}
        <div className="space-y-3 sticky top-4">

          {/* Request preview */}
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
              <p className="text-xs font-medium text-foreground">
                {t('admin.debug.sandbox.requestPreview')} <span className="text-muted-foreground font-normal">{t('admin.debug.sandbox.live')}</span>
                {previewLoading && <span className="ml-2 text-muted-foreground/60">{t('admin.debug.sandbox.updating')}</span>}
              </p>
              {previewCurl && <CopyButton text={previewCurl} className="text-xs" />}
            </div>
            <div className="p-4 space-y-3 text-xs font-mono">
              {/* Method + URL */}
              <div>
                <p className="text-muted-foreground font-sans text-xs mb-1">{t('admin.debug.sandbox.endpoint')}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium text-xs font-sans">
                    {preview?.method || 'POST'}
                  </span>
                  <span className="text-foreground break-all">
                    {preview?.endpoint || <span className="text-muted-foreground italic">{t('admin.debug.sandbox.endpointAfterModel')}</span>}
                  </span>
                </div>
              </div>

              {/* Headers */}
              <div>
                <p className="text-muted-foreground font-sans text-xs mb-1">{t('admin.debug.requestHeaders')}</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {preview?.request_headers
                    ? Object.entries(preview.request_headers).map(([k, v]) => `${k}: ${v}`).join('\n')
                    : <span className="text-muted-foreground italic">—</span>}
                </pre>
              </div>

              {/* Body */}
              <div>
                <p className="text-muted-foreground font-sans text-xs mb-1">{t('admin.debug.requestBody')}</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-72">
                  {preview?.request_body ? tryFormatJSON(preview.request_body) : '(no body)'}
                </pre>
              </div>

              {/* curl */}
              {previewCurl && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-muted-foreground font-sans text-xs">{t('admin.debug.curlCommand')}</p>
                    <CopyButton text={previewCurl} />
                  </div>
                  <pre className="bg-zinc-900 text-zinc-100 dark:bg-zinc-950 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                    {previewCurl}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                  result.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
                  {result.success ? t('admin.debug.success') : t('admin.debug.failed')}
                </span>
                {result.response_status > 0 && (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded',
                    result.response_status < 400 ? 'bg-muted' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
                    HTTP {result.response_status}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{result.latency_ms}ms</span>
                <span className="text-xs font-mono text-muted-foreground/70">{result.model_id}</span>
              </div>
              <div className="p-4">
                  <HttpExchange
                    method={result.method} url={result.endpoint}
                    headers={result.request_headers} body={result.request_body}
                    promptName={result.prompt_name}
                    systemPrompt={result.system_prompt}
                    userPrompt={result.user_prompt}
                    compiledPrompt={result.compiled_prompt}
                    promptMessages={result.prompt_messages}
                    responseStatus={result.response_status} responseBody={result.response_body}
                  latencyMs={result.latency_ms} error={result.error}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DebugPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<DebugTab>(() => debugTabFromSearchParams(searchParams))

  useEffect(() => {
    setActiveTab(debugTabFromSearchParams(searchParams))
  }, [searchParams])

  function updateTab(value: string) {
    const next = DEBUG_TABS.includes(value as DebugTab) ? (value as DebugTab) : 'system'
    setActiveTab(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'system') {
      if (hasJobFilterSearchParams(params)) {
        params.set('tab', 'system')
      } else {
        params.delete('tab')
      }
    } else {
      params.set('tab', next)
    }
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bug size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">{t('admin.tabs.debug')}</h2>
      </div>

      <Tabs value={activeTab} onValueChange={updateTab}>
        <TabsList>
          <TabsTrigger value="system">{t('admin.debug.tabs.system')}</TabsTrigger>
          <TabsTrigger value="llm-calls">{t('admin.debug.tabs.llmCalls', { defaultValue: 'LLM 调用' })}</TabsTrigger>
          <TabsTrigger value="provider-sandbox">{t('admin.debug.tabs.providerSandbox')}</TabsTrigger>
          <TabsTrigger value="raw-call">{t('admin.debug.tabs.rawCall')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('admin.debug.tabs.jobs')}</TabsTrigger>
          <TabsTrigger value="connectivity">{t('admin.debug.tabs.connectivity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="mt-4">
          <SystemOverviewSection />
        </TabsContent>

        <TabsContent value="llm-calls" className="mt-4">
          <LLMCallLogsSection />
        </TabsContent>

        <TabsContent value="provider-sandbox" className="mt-4">
          <ProviderSandboxSection />
        </TabsContent>

        <TabsContent value="raw-call" className="mt-4">
          <RawCallSection />
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <JobMonitorSection />
        </TabsContent>

        <TabsContent value="connectivity" className="mt-4">
          <ModelConnectivitySection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
