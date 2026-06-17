import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Wand2 } from 'lucide-react'
import type { ChatGenerationJob, ChatGenerationParamAudit, ChatGenerationValidationError } from '@/features/agent/state/agentStore'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import { generationJobBadge, generationProgressTitle, generationStatusText, generationTimingLabel } from '@/features/agent/domain/agentGenerationDisplay'
import { agentGenerationStatusRecipe, agentReadinessStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  AgentGeneratedCard,
  AgentGeneratedCardHeader,
  AgentGeneratedCountBadge,
  AgentGeneratedDescription,
  AgentGeneratedHeaderCopy,
  AgentGeneratedHeaderMeta,
  AgentGeneratedIconSlot,
  AgentGeneratedIntentText,
  AgentGeneratedItem,
  AgentGeneratedItemCopy,
  AgentGeneratedItemDetail,
  AgentGeneratedItemHeader,
  AgentGeneratedItemMeta,
  AgentGeneratedItemProgressBar,
  AgentGeneratedItemTitle,
  AgentGeneratedProgressBar,
  AgentGeneratedStack,
  AgentGeneratedStat,
  AgentGeneratedStatGrid,
  AgentGeneratedStatPill,
  AgentGeneratedStatusBadge,
  AgentGeneratedSupportText,
  AgentGeneratedTitle,
} from '@/features/agent/components/GenerationCardUi'

export function GenerationProgressCard({ state }: { state: GenerationProgressState }) {
  const [now, setNow] = useState(() => new Date().toISOString())
  const title = generationProgressTitle(state)
  const badge = generationJobBadge(state)
  const badgeRecipe = agentGenerationStatusRecipe(badge.state)
  const status = generationStatusText(state.status, state.stage)
  const progress = state.progress !== undefined ? clampNumber(state.progress, 0, 100) : undefined
  const terminalProgress = state.terminal ? (progress ?? 100) : progress
  const waitingTime = !state.terminal ? durationLabel(state.firstSeenAt, now) : ''
  const timing = generationTimingLabel({
    ...state,
    updatedAt: state.terminal ? state.updatedAt : now,
  }, generationDisplayLocale())
  const icon = badge.state === 'failed' || badge.state === 'cancelled' || badge.state === 'timeout'
    ? (
        <AgentGeneratedIconSlot intent="warning">
          <AlertCircle size={12} />
        </AgentGeneratedIconSlot>
      )
    : state.terminal
      ? (
          <AgentGeneratedIconSlot intent="success">
            <Check size={12} />
          </AgentGeneratedIconSlot>
        )
      : (
          <AgentGeneratedIconSlot muted spinning>
            <Loader2 size={12} />
          </AgentGeneratedIconSlot>
        )
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
    <AgentGeneratedCard data-testid="agent-generation-progress" aria-live="polite">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          {icon}
          <AgentGeneratedTitle>{title}</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedHeaderMeta>{status}</AgentGeneratedHeaderMeta>
          <AgentGeneratedStatusBadge intent={badgeRecipe.intent} emphasis={badgeRecipe.emphasis}>
            {badge.label}
          </AgentGeneratedStatusBadge>
        </AgentGeneratedHeaderCopy>
      </AgentGeneratedCardHeader>
      <AgentGeneratedProgressBar
        data-testid={terminalProgress !== undefined ? 'agent-generation-progress-bar' : 'agent-generation-waiting-bar'}
        value={terminalProgress}
        tone={generationProgressIntent(badge.state)}
        size="sm"
        indeterminate={terminalProgress === undefined}
        {...(terminalProgress === undefined
          ? { 'aria-valuetext': waitingTime ? `已等待 ${waitingTime}` : '等待生成服务返回结果' }
          : undefined)}
      />
      <AgentGeneratedDescription>
        {message}
      </AgentGeneratedDescription>
      {generationOutputResourceLabel(state, '输出资源') && (
        <AgentGeneratedSupportText>{generationOutputResourceLabel(state, '输出资源')}</AgentGeneratedSupportText>
      )}
      {timing && (
        <AgentGeneratedSupportText>{timing}</AgentGeneratedSupportText>
      )}
    </AgentGeneratedCard>
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
    <AgentGeneratedCard data-testid="agent-generation-job-summary">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot intent="info">
            <Wand2 size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>生成任务</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedCountBadge>{jobs.length} 个任务</AgentGeneratedCountBadge>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStack>
        {jobs.map((job, index) => {
          const progress = job.progress !== undefined ? clampNumber(job.progress, 0, 100) : undefined
          const timing = generationTimingLabel(job, generationDisplayLocale())
          const badge = generationJobBadge(job)
          const badgeRecipe = agentGenerationStatusRecipe(badge.state)
          return (
            <AgentGeneratedItem key={job.jobId !== undefined ? `job-${job.jobId}` : `job-${index}`}>
              <AgentGeneratedItemHeader>
                <AgentGeneratedItemCopy>
                  <AgentGeneratedItemTitle>
                    {job.jobId !== undefined ? `Job #${job.jobId}` : `生成任务 ${index + 1}`}
                    {job.jobType ? ` · ${job.jobType}` : ''}
                  </AgentGeneratedItemTitle>
                  <AgentGeneratedItemMeta>
                    {[job.status, job.stage, generationOutputResourceLabel(job)].filter(Boolean).join(' · ')}
                  </AgentGeneratedItemMeta>
                  {(job.providerName || job.modelDisplay || job.modelIdentifier) && (
                    <AgentGeneratedItemMeta>
                      {[
                        job.providerName,
                        job.modelDisplay ?? job.modelIdentifier,
                      ].filter(Boolean).join(' · ')}
                    </AgentGeneratedItemMeta>
                  )}
                </AgentGeneratedItemCopy>
                <AgentGeneratedStatusBadge intent={badgeRecipe.intent} emphasis={badgeRecipe.emphasis}>
                  {badge.label}
                </AgentGeneratedStatusBadge>
              </AgentGeneratedItemHeader>
              {progress !== undefined && (
                <AgentGeneratedItemProgressBar
                  data-testid="agent-generation-job-progress-bar"
                  value={progress}
                  tone={generationProgressIntent(badge.state)}
                  size="sm"
                />
              )}
              {job.message && (
                <AgentGeneratedItemDetail>{job.message}</AgentGeneratedItemDetail>
              )}
              {timing && (
                <AgentGeneratedItemMeta>{timing}</AgentGeneratedItemMeta>
              )}
            </AgentGeneratedItem>
          )
        })}
      </AgentGeneratedStack>
    </AgentGeneratedCard>
  )
}

export function GenerationParamAuditCard({ audits }: { audits?: ChatGenerationParamAudit[] }) {
  if (!audits?.length) return null
  return (
    <AgentGeneratedCard data-testid="agent-generation-param-audit">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot intent="info">
            <Wand2 size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>参数校验</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedCountBadge>{audits.length} 次提交</AgentGeneratedCountBadge>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStack>
        {audits.map((audit, index) => {
          const droppedCount = audit.droppedExtraParams.length + audit.droppedTopLevelParams.length
          const auditRecipe = agentReadinessStatusRecipe(droppedCount === 0)
          return (
            <AgentGeneratedItem key={audit.stepId ?? `audit-${index}`}>
              <AgentGeneratedItemHeader>
                <AgentGeneratedItemTitle>
                  {audit.jobId !== undefined ? `Job #${audit.jobId}` : `生成提交 ${index + 1}`}
                </AgentGeneratedItemTitle>
                <AgentGeneratedStatusBadge intent={auditRecipe.intent} emphasis={auditRecipe.emphasis}>
                  {droppedCount > 0 ? `过滤 ${droppedCount}` : '已匹配'}
                </AgentGeneratedStatusBadge>
              </AgentGeneratedItemHeader>
              <AgentGeneratedItemMeta>
                模型合约：{audit.modelContractLoaded ? '已加载' : '未加载'}
                {audit.supportedParams.length > 0 ? ` · ${audit.supportedParams.length} 个参数` : ''}
                {audit.paramsSchemaLoaded ? ` · schema${audit.paramsSchemaRuleCount !== undefined ? ` ${audit.paramsSchemaRuleCount} 条规则` : ''}` : ''}
              </AgentGeneratedItemMeta>
              {audit.inputRequirements && (
                <AgentGeneratedItemDetail>
                  输入需求：图片 {formatInputRequirement(audit.inputRequirements.image)} · 视频 {formatInputRequirement(audit.inputRequirements.video)}
                  {audit.submittedInputs ? ` · 已提交 图片 ${audit.submittedInputs.image}/视频 ${audit.submittedInputs.video}` : ''}
                </AgentGeneratedItemDetail>
              )}
              {audit.submittedExtraParams.length > 0 && (
                <AgentGeneratedItemDetail>
                  提交：{audit.submittedExtraParams.join('、')}
                </AgentGeneratedItemDetail>
              )}
              {audit.droppedExtraParams.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  过滤 extra_params：{audit.droppedExtraParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.droppedTopLevelParams.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  过滤顶层参数：{audit.droppedTopLevelParams.map((key) => formatDroppedParam(key, audit.dropReasons)).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.renamedExtraParams && Object.keys(audit.renamedExtraParams).length > 0 && (
                <AgentGeneratedItemDetail>
                  参数别名：{formatRenamedParams(audit.renamedExtraParams)}
                </AgentGeneratedItemDetail>
              )}
              {audit.extraParamsParseError && (
                <AgentGeneratedIntentText as="p" intent="danger">
                  extra_params 解析失败：{audit.extraParamsParseError}
                </AgentGeneratedIntentText>
              )}
              {audit.preflightErrors && audit.preflightErrors.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  本地预检：{audit.preflightErrors.map(formatPreflightError).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.inputPreflightErrors && audit.inputPreflightErrors.length > 0 && (
                <AgentGeneratedIntentText as="p" intent="warning">
                  输入预检：{audit.inputPreflightErrors.map(formatInputPreflightError).join('、')}
                </AgentGeneratedIntentText>
              )}
              {audit.repairNote && (
                <AgentGeneratedIntentText as="p" intent="success">
                  自动修复：{audit.repairNote}
                </AgentGeneratedIntentText>
              )}
            </AgentGeneratedItem>
          )
        })}
      </AgentGeneratedStack>
    </AgentGeneratedCard>
  )
}

export function GenerationValidationErrorCard({ errors }: { errors?: ChatGenerationValidationError[] }) {
  if (!errors?.length) return null
  return (
    <AgentGeneratedCard data-testid="agent-generation-validation-errors">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot>
            <AlertCircle size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>生成校验失败</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedStat intent="danger">{errors.length} 个错误</AgentGeneratedStat>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStack>
        {errors.map((error, index) => (
          <AgentGeneratedItem key={error.stepId ?? `generation-error-${index}`} intent="danger">
            <AgentGeneratedItemTitle>
              {error.field ? `${error.field} · ` : ''}{error.code}
            </AgentGeneratedItemTitle>
            <AgentGeneratedItemDetail>{error.message}</AgentGeneratedItemDetail>
            {error.allowedValues && error.allowedValues.length > 0 && (
              <AgentGeneratedItemDetail>
                允许值：{error.allowedValues.join('、')}
              </AgentGeneratedItemDetail>
            )}
            {error.requiredMin !== undefined && error.allowedMax !== undefined && error.actualCount !== undefined && (
              <AgentGeneratedItemDetail>
                输入数量：{error.actualCount}，要求 {error.requiredMin}-{error.allowedMax === -1 ? '不限' : error.allowedMax}
              </AgentGeneratedItemDetail>
            )}
            {error.suggestedFix && (
              <AgentGeneratedIntentText as="p" intent="warning">
                建议：{formatSuggestedFix(error.suggestedFix).replace(/^，建议 /, '')}
              </AgentGeneratedIntentText>
            )}
          </AgentGeneratedItem>
        ))}
      </AgentGeneratedStack>
    </AgentGeneratedCard>
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
    <AgentGeneratedCard data-testid="agent-generation-trace-summary">
      <AgentGeneratedCardHeader>
        <AgentGeneratedHeaderCopy>
          <AgentGeneratedIconSlot intent="info">
            <Wand2 size={12} />
          </AgentGeneratedIconSlot>
          <AgentGeneratedTitle>过程总览</AgentGeneratedTitle>
        </AgentGeneratedHeaderCopy>
        <AgentGeneratedCountBadge>{jobs.length} 个状态</AgentGeneratedCountBadge>
      </AgentGeneratedCardHeader>
      <AgentGeneratedStatGrid>
        <StatPill label="监控中" value={active} />
        <StatPill label="已结束" value={terminal} />
        <StatPill label="成功" value={succeeded} />
        <StatPill label="失败" value={failed} />
        <StatPill label="取消" value={cancelled} />
        <StatPill label="超时" value={timeout} />
      </AgentGeneratedStatGrid>
      {latest && (
        <AgentGeneratedItem>
          <AgentGeneratedItemTitle>
            {latest.jobId !== undefined ? `最新 Job #${latest.jobId}` : '最新任务'}
            {latest.jobType ? ` · ${latest.jobType}` : ''}
          </AgentGeneratedItemTitle>
          <AgentGeneratedItemMeta>
            {[latest.status, latest.stage, generationOutputResourceLabel(latest)].filter(Boolean).join(' · ')}
          </AgentGeneratedItemMeta>
          {(latest.providerName || latest.modelDisplay || latest.modelIdentifier) && (
            <AgentGeneratedItemMeta>
              {[
                latest.providerName,
                latest.modelDisplay ?? latest.modelIdentifier,
              ].filter(Boolean).join(' · ')}
            </AgentGeneratedItemMeta>
          )}
        </AgentGeneratedItem>
      )}
    </AgentGeneratedCard>
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

function generationProgressIntent(state: ReturnType<typeof generationJobBadge>['state']) {
  if (state === 'failed') return 'danger'
  if (state === 'cancelled' || state === 'timeout') return 'warning'
  if (state === 'completed') return 'success'
  return 'brand'
}

function StatPill({ label, value }: { label: string; value: number }) {
  return <AgentGeneratedStatPill label={label} value={value} />
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
