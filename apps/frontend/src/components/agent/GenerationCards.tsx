import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Wand2 } from 'lucide-react'
import type { ChatGenerationJob, ChatGenerationParamAudit, ChatGenerationValidationError } from '@/store/agentStore'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import { generationJobBadge, generationProgressTitle, generationStatusText, generationTimingLabel, type GenerationJobBadgeTone } from '@/lib/agentGenerationDisplay'
import { cn } from '@/lib/utils'

export function GenerationProgressCard({ state }: { state: GenerationProgressState }) {
  const [now, setNow] = useState(() => new Date().toISOString())
  const title = generationProgressTitle(state)
  const badge = generationJobBadge(state)
  const status = generationStatusText(state.status, state.stage)
  const progress = state.progress !== undefined ? clampNumber(state.progress, 0, 100) : undefined
  const waitingTime = !state.terminal ? durationLabel(state.firstSeenAt, now) : ''
  const timing = generationTimingLabel({
    ...state,
    updatedAt: state.terminal ? state.updatedAt : now,
  }, generationDisplayLocale())
  const icon = badge.tone === 'failed' || badge.tone === 'warning'
    ? <AlertCircle size={12} className="shrink-0 text-amber-600" />
    : state.terminal
      ? <Check size={12} className="shrink-0 text-green-600" />
      : <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
  useEffect(() => {
    if (state.terminal) return undefined
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000)
    return () => window.clearInterval(timer)
  }, [state.terminal])
  const message = state.message
    ?? (state.status === 'timeout' || state.stage === 'timeout'
      ? '生成监控已超时，任务可能仍在后台继续运行。'
      : progress !== undefined
        ? `当前进度 ${progress}%`
        : waitingTime
          ? `正在等待生成服务返回结果，已等待 ${waitingTime}。`
          : '正在等待生成服务返回结果。')
  return (
    <div data-testid="agent-generation-progress" aria-live="polite" className="space-y-2 rounded-md border border-border bg-background/70 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="truncate text-[11px] font-medium text-foreground">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{status}</span>
          <span className={cn('rounded border px-1.5 py-0 text-[9px] leading-4', generationJobBadgeClass(badge.tone))}>
            {badge.label}
          </span>
        </div>
      </div>
      {progress !== undefined ? (
        <div
          data-testid="agent-generation-progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : !state.terminal && (
        <div
          data-testid="agent-generation-waiting-bar"
          role="progressbar"
          aria-valuetext={waitingTime ? `已等待 ${waitingTime}` : '等待生成服务返回结果'}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 rounded-full bg-primary/70 animate-pulse" />
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {message}
      </p>
      {generationOutputResourceLabel(state, '输出资源') && (
        <p className="text-[10px] text-muted-foreground/80">{generationOutputResourceLabel(state, '输出资源')}</p>
      )}
      {timing && (
        <p className="text-[10px] text-muted-foreground/80">{timing}</p>
      )}
    </div>
  )
}

function durationLabel(start: string | undefined, end: string | undefined) {
  if (!start || !end) return ''
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return ''
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.floor(ms / 1000)} 秒`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
}

export function GenerationJobSummaryCard({ jobs }: { jobs?: ChatGenerationJob[] }) {
  if (!jobs?.length) return null
  return (
    <div data-testid="agent-generation-job-summary" className="mt-2 rounded-md border border-border bg-background/70 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wand2 size={12} className="shrink-0 text-primary" />
          <span className="truncate text-[11px] font-medium text-foreground">生成任务</span>
        </div>
        <span className="shrink-0 rounded border border-transparent bg-secondary px-1.5 py-0 text-[9px] leading-4 text-secondary-foreground">
          {jobs.length} 个任务
        </span>
      </div>
      <div className="space-y-1.5">
        {jobs.map((job, index) => {
          const progress = job.progress !== undefined ? clampNumber(job.progress, 0, 100) : undefined
          const timing = generationTimingLabel(job, generationDisplayLocale())
          const badge = generationJobBadge(job)
          const badgeClass = generationJobBadgeClass(badge.tone)
          return (
            <div key={job.jobId !== undefined ? `job-${job.jobId}` : `job-${index}`} className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-foreground">
                    {job.jobId !== undefined ? `Job #${job.jobId}` : `生成任务 ${index + 1}`}
                    {job.jobType ? ` · ${job.jobType}` : ''}
                  </p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {[job.status, job.stage, generationOutputResourceLabel(job)].filter(Boolean).join(' · ')}
                  </p>
                  {(job.providerName || job.modelDisplay || job.modelIdentifier || job.modelConfigId !== undefined) && (
                    <p className="truncate text-[9px] text-muted-foreground">
                      {[
                        job.providerName,
                        job.modelDisplay ?? job.modelIdentifier,
                        job.modelConfigId !== undefined ? `model #${job.modelConfigId}` : undefined,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className={cn('shrink-0 rounded border px-1.5 py-0 text-[9px] leading-4', badgeClass)}>
                  {badge.label}
                </span>
              </div>
              {progress !== undefined && (
                <div
                  data-testid="agent-generation-job-progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div className={cn('h-full rounded-full transition-[width]', badge.tone === 'failed' || badge.tone === 'warning' ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${progress}%` }} />
                </div>
              )}
              {job.message && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{job.message}</p>
              )}
              {timing && (
                <p className="mt-1 text-[9px] text-muted-foreground/80">{timing}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function GenerationParamAuditCard({ audits }: { audits?: ChatGenerationParamAudit[] }) {
  if (!audits?.length) return null
  return (
    <div data-testid="agent-generation-param-audit" className="mt-2 rounded-md border border-border bg-background/70 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wand2 size={12} className="shrink-0 text-primary" />
          <span className="truncate text-[11px] font-medium text-foreground">参数校验</span>
        </div>
        <span className="shrink-0 rounded border border-transparent bg-secondary px-1.5 py-0 text-[9px] leading-4 text-secondary-foreground">
          {audits.length} 次提交
        </span>
      </div>
      <div className="space-y-1.5">
        {audits.map((audit, index) => {
          const droppedCount = audit.droppedExtraParams.length + audit.droppedTopLevelParams.length
          return (
            <div key={audit.stepId ?? `audit-${index}`} className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[10px] font-medium text-foreground">
                  {audit.jobId !== undefined ? `Job #${audit.jobId}` : `生成提交 ${index + 1}`}
                  {audit.modelConfigId !== undefined ? ` · model #${audit.modelConfigId}` : ''}
                </p>
                <span className={cn('shrink-0 rounded border px-1.5 py-0 text-[9px] leading-4', droppedCount > 0 ? 'border-amber-500/30 bg-amber-500/10 text-amber-700' : 'border-green-500/30 bg-green-500/10 text-green-700')}>
                  {droppedCount > 0 ? `过滤 ${droppedCount}` : '已匹配'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                模型合约：{audit.modelContractLoaded ? '已加载' : '未加载'}
                {audit.supportedParams.length > 0 ? ` · ${audit.supportedParams.length} 个参数` : ''}
                {audit.paramsSchemaLoaded ? ` · schema${audit.paramsSchemaRuleCount !== undefined ? ` ${audit.paramsSchemaRuleCount} 条规则` : ''}` : ''}
              </p>
              {audit.inputRequirements && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                  输入需求：图片 {formatInputRequirement(audit.inputRequirements.image)} · 视频 {formatInputRequirement(audit.inputRequirements.video)}
                  {audit.submittedInputs ? ` · 已提交 图片 ${audit.submittedInputs.image}/视频 ${audit.submittedInputs.video}` : ''}
                </p>
              )}
              {audit.submittedExtraParams.length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                  提交：{audit.submittedExtraParams.join('、')}
                </p>
              )}
              {audit.droppedExtraParams.length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
                  过滤 extra_params：{audit.droppedExtraParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </p>
              )}
              {audit.droppedTopLevelParams.length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
                  过滤顶层参数：{audit.droppedTopLevelParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </p>
              )}
              {audit.renamedExtraParams && Object.keys(audit.renamedExtraParams).length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                  参数别名：{formatRenamedParams(audit.renamedExtraParams)}
                </p>
              )}
              {audit.extraParamsParseError && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-destructive">
                  extra_params 解析失败：{audit.extraParamsParseError}
                </p>
              )}
              {audit.preflightErrors && audit.preflightErrors.length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
                  本地预检：{audit.preflightErrors.map(formatPreflightError).join('、')}
                </p>
              )}
              {audit.inputPreflightErrors && audit.inputPreflightErrors.length > 0 && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
                  输入预检：{audit.inputPreflightErrors.map(formatInputPreflightError).join('、')}
                </p>
              )}
              {audit.repairNote && (
                <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-green-700 dark:text-green-300">
                  自动修复：{audit.repairNote}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function GenerationValidationErrorCard({ errors }: { errors?: ChatGenerationValidationError[] }) {
  if (!errors?.length) return null
  return (
    <div data-testid="agent-generation-validation-errors" className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <AlertCircle size={12} className="shrink-0 text-red-600" />
          <span className="truncate text-[11px] font-medium text-foreground">生成校验失败</span>
        </div>
        <span className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] leading-4 text-red-700">
          {errors.length} 个错误
        </span>
      </div>
      <div className="space-y-1.5">
        {errors.map((error, index) => (
          <div key={error.stepId ?? `generation-error-${index}`} className="rounded border border-red-500/20 bg-background/70 px-2 py-1.5">
            <p className="truncate text-[10px] font-medium text-foreground">
              {error.field ? `${error.field} · ` : ''}{error.code}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{error.message}</p>
            {error.allowedValues && error.allowedValues.length > 0 && (
              <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                允许值：{error.allowedValues.join('、')}
              </p>
            )}
            {error.requiredMin !== undefined && error.allowedMax !== undefined && error.actualCount !== undefined && (
              <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                输入数量：{error.actualCount}，要求 {error.requiredMin}-{error.allowedMax === -1 ? '不限' : error.allowedMax}
              </p>
            )}
            {error.suggestedFix && (
              <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
                建议：{formatSuggestedFix(error.suggestedFix).replace(/^，建议 /, '')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDroppedParam(key: string, reasons?: Record<string, string>): string {
  const reason = reasons?.[key]
  if (!reason) return key
  return `${key} (${formatDropReason(reason)})`
}

function formatDropReason(reason: string): string {
  switch (reason) {
    case 'unsupported_extra_param':
      return '不支持'
    case 'unsupported_top_level_param':
      return '模型不支持'
    case 'parse_error':
      return '解析失败'
    default:
      return reason
  }
}

function formatRenamedParams(values: Record<string, string>): string {
  return Object.entries(values).map(([from, to]) => `${from} -> ${to}`).join('、')
}

function formatInputRequirement(value: { min: number, max: number }): string {
  return `${value.min}-${value.max === -1 ? '不限' : value.max}`
}

function formatPreflightError(error: NonNullable<ChatGenerationParamAudit['preflightErrors']>[number]): string {
  const allowed = error.allowedValues?.length ? `，允许 ${error.allowedValues.join('/')}` : ''
  const suggested = formatSuggestedFix(error.suggestedFix)
  return `${error.field} (${error.code}${allowed}${suggested})`
}

function formatInputPreflightError(error: NonNullable<ChatGenerationParamAudit['inputPreflightErrors']>[number]): string {
  const label = error.field === 'image' ? '图片' : '视频'
  const max = error.allowedMax === -1 ? '不限' : String(error.allowedMax)
  return `${label} ${error.actualCount} 个 (要求 ${error.requiredMin}-${max})`
}

function formatSuggestedFix(value?: Record<string, unknown>): string {
  if (!value) return ''
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string | number | boolean | null] => (
      entry[0].trim().length > 0 && isReadableSuggestedFixValue(entry[1])
    ))
    .sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return ''
  return `，建议 ${entries.map(([key, fixValue]) => fixValue === null ? `删除 ${key}` : `${key}=${String(fixValue)}`).join('/')}`
}

function isReadableSuggestedFixValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function GenerationTraceSummaryCard({ jobs }: { jobs?: ChatGenerationJob[] }) {
  if (!jobs?.length) return null
  const active = jobs.filter((job) => !job.terminal && job.status !== 'timeout' && job.stage !== 'timeout').length
  const terminal = jobs.filter((job) => job.terminal).length
  const succeeded = jobs.filter((job) => job.status === 'succeeded' || job.stage === 'completed').length
  const failed = jobs.filter((job) => job.status === 'failed' || job.stage === 'failed').length
  const cancelled = jobs.filter((job) => job.status === 'cancelled' || job.stage === 'cancelled').length
  const timeout = jobs.filter((job) => job.status === 'timeout' || job.stage === 'timeout').length
  const latest = jobs.at(-1)
  return (
    <div data-testid="agent-generation-trace-summary" className="mt-2 rounded-md border border-border bg-background/70 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wand2 size={12} className="shrink-0 text-primary" />
          <span className="truncate text-[11px] font-medium text-foreground">过程总览</span>
        </div>
        <span className="shrink-0 rounded border border-transparent bg-secondary px-1.5 py-0 text-[9px] leading-4 text-secondary-foreground">
          {jobs.length} 个状态
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[9px] text-muted-foreground">
        <StatPill label="监控中" value={active} />
        <StatPill label="已结束" value={terminal} />
        <StatPill label="成功" value={succeeded} />
        <StatPill label="失败" value={failed} />
        <StatPill label="取消" value={cancelled} />
        <StatPill label="超时" value={timeout} />
      </div>
      {latest && (
        <div className="mt-2 rounded border border-border/70 bg-muted/20 px-2 py-1.5">
          <p className="truncate text-[10px] font-medium text-foreground">
            {latest.jobId !== undefined ? `最新 Job #${latest.jobId}` : '最新任务'}
            {latest.jobType ? ` · ${latest.jobType}` : ''}
          </p>
          <p className="truncate text-[9px] text-muted-foreground">
            {[latest.status, latest.stage, generationOutputResourceLabel(latest)].filter(Boolean).join(' · ')}
          </p>
          {(latest.providerName || latest.modelDisplay || latest.modelIdentifier) && (
            <p className="truncate text-[9px] text-muted-foreground">
              {[
                latest.providerName,
                latest.modelDisplay ?? latest.modelIdentifier,
                latest.modelConfigId !== undefined ? `model #${latest.modelConfigId}` : undefined,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function generationOutputResourceLabel(item: { outputResourceId?: number; outputResourceIds?: number[] }, prefix = '资源') {
  const ids = item.outputResourceIds?.length
    ? item.outputResourceIds
    : item.outputResourceId !== undefined
      ? [item.outputResourceId]
      : []
  if (ids.length === 0) return ''
  return ids.length === 1 ? `${prefix} #${ids[0]}` : `${prefix} ${ids.map((id) => `#${id}`).join('、')}`
}

function generationDisplayLocale() {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN'
}

function generationJobBadgeClass(tone: GenerationJobBadgeTone) {
  switch (tone) {
    case 'failed':
      return 'border-red-500/30 bg-red-500/10 text-red-700'
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700'
    case 'success':
      return 'border-green-500/30 bg-green-500/10 text-green-700'
    default:
      return ''
  }
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border/70 bg-muted/20 px-2 py-1">
      <p className="text-[8px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[10px] font-medium text-foreground">{value}</p>
    </div>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
