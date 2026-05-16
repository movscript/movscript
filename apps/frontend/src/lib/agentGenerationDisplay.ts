import type { GenerationProgressState } from './agentGenerationMedia'

export type GenerationJobBadgeTone = 'default' | 'success' | 'warning' | 'failed'

export interface GenerationJobBadge {
  label: string
  tone: GenerationJobBadgeTone
}

export function generationProgressTitle(state: Pick<GenerationProgressState, 'jobId'>) {
  return state.jobId !== undefined ? `生成任务 #${state.jobId}` : '生成任务'
}

export function generationStatusText(status: string, stage?: string) {
  const statusLabel = generationLifecycleLabel(status)
  const stageLabel = stage ? generationLifecycleLabel(stage) : undefined
  return stageLabel && stage !== status
    ? `${statusLabel} · ${stageLabel}`
    : statusLabel
}

function generationLifecycleLabel(value: string): string {
  switch (value) {
    case 'queued': return '排队中'
    case 'claimed': return '已领取'
    case 'running': return '运行中'
    case 'rendering': return '渲染中'
    case 'provider_rendering': return '服务商渲染中'
    case 'processing': return '处理中'
    case 'uploading': return '上传中'
    case 'completed': return '已完成'
    case 'succeeded': return '成功'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    case 'timeout': return '超时'
    default: return `未知状态 (${value})`
  }
}

export function generationJobBadge(job: Pick<GenerationProgressState, 'status' | 'stage' | 'terminal'>): GenerationJobBadge {
  const failed = job.status === 'failed' || job.stage === 'failed'
  const cancelled = job.status === 'cancelled' || job.stage === 'cancelled'
  const timeout = job.status === 'timeout' || job.stage === 'timeout'
  const completed = job.status === 'succeeded' || job.stage === 'completed'
  if (failed) return { label: '失败', tone: 'failed' }
  if (cancelled) return { label: '已取消', tone: 'warning' }
  if (timeout) return { label: '超时', tone: 'warning' }
  if (completed) return { label: '完成', tone: 'success' }
  if (job.terminal) return { label: '已结束', tone: 'default' }
  return { label: '监控中', tone: 'default' }
}

export function generationTimingLabel(
  item: Pick<GenerationProgressState, 'firstSeenAt' | 'updatedAt' | 'completedAt' | 'terminal'>,
  locale = 'zh-CN',
) {
  const completedAt = item.completedAt ?? (item.terminal ? item.updatedAt : undefined)
  const duration = durationLabel(item.firstSeenAt, completedAt ?? item.updatedAt)
  const updatedTime = formatActivityTime(completedAt ?? item.updatedAt, locale)
  return [
    duration ? `${item.terminal ? '耗时' : '已监控'} ${duration}` : undefined,
    updatedTime ? `${item.terminal ? '结束' : '更新'} ${updatedTime}` : undefined,
  ].filter(Boolean).join(' · ')
}

function formatActivityTime(value: string | undefined, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function durationLabel(start: string | undefined, end: string | undefined) {
  if (!start || !end) return ''
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return ''
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}
