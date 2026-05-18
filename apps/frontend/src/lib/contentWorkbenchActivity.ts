import type { ContentWorkbenchNextActionKey } from './contentWorkbenchNextActions'

export type ContentWorkbenchActivityTone = 'done' | 'running' | 'blocked' | 'pending'

export interface ContentWorkbenchActivityJobLike {
  id: string | number
  title?: string
  type?: string
  status?: string
  outputResourceId?: string | number | null
  outputResourceIds?: Array<string | number> | null
  error?: string
}

export interface ContentWorkbenchActivityInput {
  hasSelectedUnit: boolean
  selectedUnitTitle?: string
  missingAssetTitles: string[]
  keyframeTitles: string[]
  generationContextReady: boolean
  generationContextLoading: boolean
  generationContextError: boolean
  pendingReviewDraftCount: number
  jobs: ContentWorkbenchActivityJobLike[]
}

export interface ContentWorkbenchActivityItem {
  key: string
  title: string
  detail: string
  tone: ContentWorkbenchActivityTone
  actionKey?: ContentWorkbenchNextActionKey
  actionLabel?: string
}

export interface ContentWorkbenchActivityFeed {
  title: string
  detail: string
  items: ContentWorkbenchActivityItem[]
}

export function buildContentWorkbenchActivityFeed(input: ContentWorkbenchActivityInput): ContentWorkbenchActivityFeed {
  if (!input.hasSelectedUnit) {
    return {
      title: '等待生产焦点',
      detail: '选择制作项后，活动流会追踪 AI 审稿和生成任务记录。',
      items: [{
        key: 'select-unit',
        title: '选择制作项',
        detail: '先定位一个生成目标，再继续生产。',
        tone: 'pending',
        actionKey: 'select_unit',
        actionLabel: '选择',
      }],
    }
  }

  const items: ContentWorkbenchActivityItem[] = []
  const pendingReviewDraftCount = positiveInteger(input.pendingReviewDraftCount)

  if (pendingReviewDraftCount > 0) {
    items.push({
      key: 'review-drafts',
      title: 'AI 草案待审',
      detail: `${pendingReviewDraftCount} 个草案需要人工确认后再进入生成计划。`,
      tone: 'blocked',
      actionKey: 'review_ai_drafts',
      actionLabel: '审阅',
    })
  }

  items.push(...summarizeJobs(input.jobs))

  const visibleItems = items.slice(0, 5)
  const blockedCount = visibleItems.filter((item) => item.tone === 'blocked').length
  const runningCount = visibleItems.filter((item) => item.tone === 'running').length
  return {
    title: blockedCount > 0 ? '生产活动需处理' : runningCount > 0 ? '生产活动执行中' : visibleItems.some((item) => item.tone === 'done') ? '生产活动可追溯' : '生产活动待启动',
    detail: `${firstText(input.selectedUnitTitle, '当前制作项')} · ${blockedCount > 0 ? `${blockedCount} 条活动需要处理` : `${visibleItems.length} 条活动记录`}`,
    items: visibleItems,
  }
}

function summarizeJobs(jobs: ContentWorkbenchActivityJobLike[]): ContentWorkbenchActivityItem[] {
  const normalizedJobs = jobs.slice(0, 3)
  if (normalizedJobs.length === 0) {
    return [{
      key: 'job-empty',
      title: '暂无生成活动',
      detail: '生成前缺口请查看生成检查和制作项健康度。',
      tone: 'pending',
    }]
  }
  return normalizedJobs.map((job) => {
    const status = String(job.status ?? '').trim().toLowerCase()
    const title = firstText(job.title, `任务 #${job.id}`)
    const type = firstText(job.type, '生成任务')
    if (status === 'failed' || status === 'cancelled') {
      return {
        key: `job-${job.id}`,
        title: `${title} 异常`,
        detail: firstText(job.error, type),
        tone: 'blocked',
      }
    }
    if (status === 'pending' || status === 'running') {
      return {
        key: `job-${job.id}`,
        title: `${title} 运行中`,
        detail: type,
        tone: 'running',
      }
    }
    return {
      key: `job-${job.id}`,
      title: `${title} 已完成`,
      detail: outputResourceDetail(job) || type,
      tone: 'done',
    }
  })
}

function outputResourceDetail(job: ContentWorkbenchActivityJobLike) {
  const ids = uniquePositiveNumbers([
    ...(Array.isArray(job.outputResourceIds) ? job.outputResourceIds : []),
    job.outputResourceId,
  ])
  if (ids.length === 0) return ''
  return ids.length === 1 ? `输出资源 #${ids[0]}` : `输出资源 ${ids.map((id) => `#${id}`).join('、')}`
}

function uniquePositiveNumbers(values: unknown[]) {
  const seen = new Set<number>()
  const result: number[] = []
  for (const value of values) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0 || seen.has(parsed)) continue
    seen.add(parsed)
    result.push(parsed)
  }
  return result
}

function positiveInteger(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0))
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
