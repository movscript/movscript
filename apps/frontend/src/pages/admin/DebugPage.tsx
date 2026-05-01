import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import type { AICredential, DebugCallResult, DebugHTTPExchange, JobDetail, JobStateTraceEntry, RawCallResult, AdapterDef, ParamDef } from '@/types'
import { Bug, RefreshCw, ChevronDown, ChevronRight, Send, Copy, Check, Zap, CheckCircle2, XCircle, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

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

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-muted text-muted-foreground',
  running:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  succeeded: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
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

function HttpExchange({ method, url, headers, body, responseStatus, responseBody, latencyMs, error }: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
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

function JobMonitorSection() {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [page, setPage] = useState(1)

  const { data, refetch, isFetching } = useQuery<{ jobs: JobDetail[]; total: number }>({
    queryKey: ['admin', 'debug', 'jobs', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(JOB_MONITOR_PAGE_SIZE),
        offset: String((page - 1) * JOB_MONITOR_PAGE_SIZE),
      })
      if (statusFilter) params.set('status', statusFilter)
      const res = await api.get<JobDetail[]>(`/admin/debug/jobs?${params.toString()}`)
      const total = Number(res.headers['x-total-count'] ?? res.data.length)
      return { jobs: res.data, total }
    },
    refetchInterval: autoRefresh ? 3000 : false,
  })
  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / JOB_MONITOR_PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

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
        {['', 'pending', 'running', 'succeeded', 'failed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors', statusFilter === s ? 'border-ring bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {s === '' ? t('common.all') : t(`pages.jobs.status.${s}`, { defaultValue: s })}
          </button>
        ))}
      </div>

      {total > JOB_MONITOR_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('admin.debug.jobs.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              {t('admin.logs.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>
              {t('admin.logs.nextPage')}
            </Button>
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.debug.jobs.empty')}</p>
      )}

      <div className="space-y-2">
        {jobs.map((job) => {
          const isExpanded = expandedId === job.ID
          const hasDebug = !!job.debug_detail || !!job.debug_info
          const stateTrace = parseStateTrace(job.state_trace)
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
                {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
              </div>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 bg-card space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      [t('admin.debug.jobs.fields.jobId'), String(job.ID)],
                      [t('admin.debug.jobs.fields.modelConfigId'), String(job.model_config_id)],
                      [t('admin.debug.jobs.fields.jobType'), job.job_type],
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bug size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">{t('admin.tabs.debug')}</h2>
      </div>

      <Tabs defaultValue="provider-sandbox">
        <TabsList>
          <TabsTrigger value="provider-sandbox">{t('admin.debug.tabs.providerSandbox')}</TabsTrigger>
          <TabsTrigger value="raw-call">{t('admin.debug.tabs.rawCall')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('admin.debug.tabs.jobs')}</TabsTrigger>
          <TabsTrigger value="connectivity">{t('admin.debug.tabs.connectivity')}</TabsTrigger>
        </TabsList>

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
