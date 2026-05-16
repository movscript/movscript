import type { ContentWorkbenchNextActionKey } from './contentWorkbenchNextActions'

export type ContentWorkbenchActivityTone = 'done' | 'running' | 'blocked' | 'pending'

export interface ContentWorkbenchActivityJobLike {
  id: string | number
  title?: string
  type?: string
  status?: string
  outputResourceId?: string | number | null
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
      detail: '选择制作项后，活动流会追踪审稿、素材、画面锚点、上下文和生成任务。',
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
  const missingAssetTitles = input.missingAssetTitles.map(firstText).filter(Boolean)
  const keyframeTitles = input.keyframeTitles.map(firstText).filter(Boolean)

  if (pendingReviewDraftCount > 0) {
    items.push({
      key: 'review-drafts',
      title: 'AI 草案待审',
      detail: `${pendingReviewDraftCount} 个草案需要人工确认后再进入生成计划。`,
      tone: 'blocked',
      actionKey: 'review_ai_drafts',
      actionLabel: '审阅',
    })
  } else {
    items.push({
      key: 'review-drafts',
      title: 'AI 审稿已清空',
      detail: '没有待处理草案。',
      tone: 'done',
    })
  }

  if (missingAssetTitles.length > 0) {
    items.push({
      key: 'missing-assets',
      title: '素材需求阻塞',
      detail: missingAssetTitles.slice(0, 2).join('、'),
      tone: 'blocked',
      actionKey: 'upload_missing_assets',
      actionLabel: '上传',
    })
  } else {
    items.push({
      key: 'missing-assets',
      title: '素材缺口已处理',
      detail: '当前制作项没有未处理素材缺口。',
      tone: 'done',
    })
  }

  items.push({
    key: 'keyframes',
    title: keyframeTitles.length > 0 ? '画面锚点已建立' : '画面锚点待补',
    detail: keyframeTitles.length > 0 ? keyframeTitles.slice(0, 2).join('、') : '建议先补首帧和尾帧。',
    tone: keyframeTitles.length > 0 ? 'done' : 'blocked',
    actionKey: keyframeTitles.length > 0 ? undefined : 'add_first_keyframe',
    actionLabel: keyframeTitles.length > 0 ? undefined : '补帧',
  })

  items.push({
    key: 'generation-context',
    title: input.generationContextError ? '生成上下文检查失败' : input.generationContextLoading ? '生成上下文检查中' : input.generationContextReady ? '生成上下文可用' : '生成上下文待补',
    detail: input.generationContextError ? '需要重新检查后端上下文。' : input.generationContextLoading ? '正在汇总剧本、设定、素材和提示。' : input.generationContextReady ? '上下文门禁已通过。' : '仍有上下文门禁未通过。',
    tone: input.generationContextError ? 'blocked' : input.generationContextLoading ? 'running' : input.generationContextReady ? 'done' : 'blocked',
    actionKey: input.generationContextError || (!input.generationContextLoading && !input.generationContextReady) ? 'resolve_generation_context' : undefined,
    actionLabel: input.generationContextError || (!input.generationContextLoading && !input.generationContextReady) ? '编辑' : undefined,
  })

  items.push(...summarizeJobs(input.jobs))

  const visibleItems = items.slice(0, 7)
  const blockedCount = visibleItems.filter((item) => item.tone === 'blocked').length
  const runningCount = visibleItems.filter((item) => item.tone === 'running').length
  return {
    title: blockedCount > 0 ? '生产活动有阻塞' : runningCount > 0 ? '生产活动执行中' : '生产活动可追溯',
    detail: `${firstText(input.selectedUnitTitle, '当前制作项')} · ${blockedCount > 0 ? `${blockedCount} 项需要处理` : `${visibleItems.length} 条活动已记录`}`,
    items: visibleItems,
  }
}

function summarizeJobs(jobs: ContentWorkbenchActivityJobLike[]): ContentWorkbenchActivityItem[] {
  const normalizedJobs = jobs.slice(0, 3)
  if (normalizedJobs.length === 0) {
    return [{
      key: 'job-empty',
      title: '生成任务待启动',
      detail: '门禁通过后可打开生成画布执行任务。',
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
      detail: job.outputResourceId ? `输出资源 #${job.outputResourceId}` : type,
      tone: 'done',
    }
  })
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
