import { useState } from 'react'
import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DebugCallResult, Job, RawResource } from '@/types'
import { JobContextSummary, GenResultCard, formatGenTime } from '@/shared/ui/GenResultCard'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import {
  JobCardShell,
  JobCardState,
  JobGridCaption,
  JobGridDescription,
  JobGridMediaArea,
  JobGridMediaPreview,
  JobGridTitle
} from '@/shared/ui/JobDisplayUi'
import {
  ToolDialogCopyButton,
  ToolDialogDebugEndpoint,
  ToolDialogDebugHeaders,
  ToolDialogDebugJsonBlock,
  ToolDialogDebugKV,
  ToolDialogDebugPanel,
  ToolDialogDebugSection,
  ToolDialogDebugStatus,
  ToolDialogDebugTitle,
} from './ToolDialogUi'
import { Button } from '@movscript/ui/primitives'

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <ToolDialogCopyButton
      copied={copied}
      copiedLabel={t('tools.debug.copied')}
      copyLabel={t('tools.debug.copy')}
      onClick={copy}
    />
  )
}

function buildCurl(d: DebugCallResult): string {
  const headers = Object.entries(d.request_headers ?? {})
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(' \\\n  ')
  const body = d.method !== 'GET' && d.request_body
    ? `\\\n  -d '${d.request_body.replace(/'/g, "'\\''")}'`
    : ''
  return `curl -X ${d.method} '${d.endpoint}' \\\n  ${headers}${body}`
}

function DebugPanel({ job }: { job: Job }) {
  const { t, i18n } = useTranslation()
  const params = job.extra_params ? (() => { try { return JSON.parse(job.extra_params!) } catch { return {} } })() : {}
  const debug: DebugCallResult | null = job.debug_info ? (() => {
    try { return JSON.parse(job.debug_info!) } catch { return null }
  })() : null

  function KV({ label, value, mono = true, color }: { label: string; value: string; mono?: boolean; color?: string }) {
    const tone = color === 'danger' ? 'danger' : color === 'success' ? 'success' : 'default'
    return (
      <ToolDialogDebugKV label={label} value={value} mono={mono} tone={tone} />
    )
  }

  function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
      <ToolDialogDebugSection title={title}>
        {children}
      </ToolDialogDebugSection>
    )
  }

  function JsonBlock({ text, maxHeight = 'default' }: { text: string; maxHeight?: 'default' | 'large' }) {
    const pretty = (() => { try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return text } })()
    return (
      <ToolDialogDebugJsonBlock
        text={pretty}
        action={<CopyButton text={text} />}
        maxHeight={maxHeight}
      />
    )
  }

  return (
    <ToolDialogDebugPanel>
      <ToolDialogDebugTitle>{t('tools.debug.title')}</ToolDialogDebugTitle>

      <div className="space-y-1">
        <KV label="Job ID" value={String(job.ID)} />
        <KV label={t('tools.debug.status')} value={job.status} color={job.status === 'failed' ? 'danger' : job.status === 'succeeded' ? 'success' : undefined} />
        <KV label={t('tools.debug.configId')} value={String(job.model_config_id)} />
        {job.started_at && <KV label={t('tools.debug.started')} value={new Date(job.started_at).toLocaleTimeString(i18n.language)} />}
        {job.finished_at && <KV label={t('tools.debug.finished')} value={new Date(job.finished_at).toLocaleTimeString(i18n.language)} />}
        {job.error_msg && <KV label={t('common.error')} value={job.error_msg} color="danger" />}
      </div>

      {debug && (debug.job_type || debug.job_model_def_id || debug.job_resolved_prompt || (debug.job_input_resource_ids?.length ?? 0) > 0) && (
        <Section title={t('tools.debug.callContext')}>
          {debug.job_type && <KV label={t('tools.debug.outputType')} value={debug.job_type} />}
          {debug.job_model_def_id && <KV label={t('tools.debug.modelDefinition')} value={debug.job_model_def_id} />}
          {(debug.job_input_resource_ids?.length ?? 0) > 0 && (
            <KV label={t('tools.debug.inputResources')} value={debug.job_input_resource_ids!.join(', ')} />
          )}
          {debug.job_resolved_prompt && (
            <ToolDialogDebugKV label={t('tools.debug.sentPrompt')} value={debug.job_resolved_prompt} mono={false} />
          )}
        </Section>
      )}

      {Object.keys(params).length > 0 && (
        <Section title={t('admin.params.title')}>
          {Object.entries(params).map(([k, v]) => (
            <KV key={k} label={k} value={String(v)} />
          ))}
        </Section>
      )}

      {debug && debug.endpoint && (
        <Section title={`${t('tools.debug.request')} ${debug.latency_ms ? `· ${debug.latency_ms}ms` : ''}`}>
          <ToolDialogDebugEndpoint>
            <span className="text-foreground font-semibold shrink-0">{debug.method}</span>
            <span className="text-foreground break-all">{debug.endpoint}</span>
            {debug.model_id && <span className="text-muted-foreground ml-auto shrink-0">({debug.model_id})</span>}
          </ToolDialogDebugEndpoint>
          {debug.request_headers && Object.keys(debug.request_headers).length > 0 && (
            <ToolDialogDebugHeaders>
              {Object.entries(debug.request_headers).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <span className="text-muted-foreground shrink-0">{k}:</span>
                  <span className="text-foreground break-all">{v}</span>
                </div>
              ))}
            </ToolDialogDebugHeaders>
          )}
          {debug.request_body && debug.request_body !== '(no body)' && (
            <JsonBlock text={debug.request_body} />
          )}
          <div className="flex items-center gap-1.5">
            <CopyButton text={buildCurl(debug)} />
          </div>
        </Section>
      )}

      {debug && debug.response_status > 0 && (
        <Section title={t('tools.debug.response')}>
          <ToolDialogDebugStatus tone={debug.response_status < 400 ? 'success' : 'danger'}>
            {debug.response_status}
          </ToolDialogDebugStatus>
          {debug.response_body && <JsonBlock text={debug.response_body} maxHeight="large" />}
        </Section>
      )}

      {debug?.error && (
        <Section title={t('tools.debug.adapterError')}>
          <ToolDialogDebugKV label={t('common.error')} value={debug.error} mono={false} tone="danger" />
        </Section>
      )}
    </ToolDialogDebugPanel>
  )
}

export function GenerationCard({
  job,
  outputType,
  onReuse,
  debugMode,
}: {
  job: Job
  outputType: 'image' | 'video'
  onReuse: () => void
  debugMode: boolean
}) {
  const normalizedStatus = job.status === 'succeeded' ? 'done' : job.status as 'pending' | 'running' | 'failed' | 'cancelled'
  return (
    <GenResultCard
      prompt={job.prompt}
      status={normalizedStatus}
      outputResource={job.output_resource as RawResource | undefined}
      outputType={outputType}
      error={job.error_msg}
      timestamp={job.CreatedAt}
      onReuse={onReuse}
      contextPanel={<JobContextSummary job={job} includeProvider={debugMode} />}
      debugPanel={debugMode ? <DebugPanel job={job} /> : undefined}
      compact
    />
  )
}

export function GenerationHistoryGridItem({
  job,
  onReuse,
}: {
  job: Job
  onReuse: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const isActive = job.status === 'pending' || job.status === 'running'
  const normalizedStatus = job.status === 'succeeded' ? 'done' : job.status as 'pending' | 'running' | 'failed' | 'cancelled'
  const statusLabel: Record<typeof normalizedStatus, string> = {
    pending: t('pages.jobs.status.pending'),
    running: t('pages.jobs.status.running'),
    done: t('canvas.status.done'),
    failed: t('canvas.status.failed'),
    cancelled: t('pages.jobs.status.cancelled'),
  }
  const timestampLabel = job.CreatedAt ? formatGenTime(job.CreatedAt, t, locale) : undefined

  return (
    <JobCardShell layout="grid" className="tool-dialog-history-grid-item">
      <div className="tool-dialog-history-grid-item__media">
        <JobGridMediaArea>
          {isActive ? (
            <JobCardState
              layout="stack"
              text={statusLabel[normalizedStatus]}
            />
          ) : null}
          {!isActive && normalizedStatus === 'failed' ? (
            <JobCardState tone="danger" layout="stack" text={statusLabel[normalizedStatus]} />
          ) : null}
          {!isActive && normalizedStatus === 'cancelled' ? (
            <JobCardState layout="stack" text={statusLabel[normalizedStatus]} />
          ) : null}
          {!isActive && normalizedStatus === 'done' && job.output_resource ? (
            <JobGridMediaPreview>
              <MediaViewer resource={job.output_resource as RawResource} lightbox />
            </JobGridMediaPreview>
          ) : null}
          <Button
            type="button"
            variant="soft"
            size="icon-xs"
            className="tool-dialog-history-grid-item__reuse"
            title={t('shared.genResult.reusePrompt')}
            onClick={onReuse}
          >
            <RefreshCw size={12} />
          </Button>
        </JobGridMediaArea>
      </div>
      <div className="tool-dialog-history-grid-item__info">
        <JobGridCaption>
          <JobGridTitle>{job.title || statusLabel[normalizedStatus]}</JobGridTitle>
          {job.prompt ? (
            <JobGridDescription>
              {job.prompt}
            </JobGridDescription>
          ) : null}
          {timestampLabel ? (
            <span className="tool-dialog-history-grid-item__timestamp">{timestampLabel}</span>
          ) : null}
        </JobGridCaption>
      </div>
    </JobCardShell>
  )
}
