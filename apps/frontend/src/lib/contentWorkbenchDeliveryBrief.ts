export type ContentWorkbenchDeliveryBriefTone = 'empty' | 'blocked' | 'warning' | 'ready'

export interface ContentWorkbenchDeliveryBriefMetric {
  label: string
  value: string
  done: boolean
}

export interface ContentWorkbenchDeliveryBriefInput {
  hasSelectedUnit: boolean
  unitTitle?: string
  hasPrompt: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  generationContextReady: boolean
  generationContextLoading: boolean
  generationContextError: boolean
  pendingReviewDraftCount: number
  completedJobCount?: number
  previewItemCount?: number
  deliveryVersionCount?: number
}

export interface ContentWorkbenchDeliveryBrief {
  tone: ContentWorkbenchDeliveryBriefTone
  title: string
  detail: string
  progress: number
  blockers: string[]
  metrics: ContentWorkbenchDeliveryBriefMetric[]
}

export function buildContentWorkbenchDeliveryBrief(input: ContentWorkbenchDeliveryBriefInput): ContentWorkbenchDeliveryBrief {
  if (!input.hasSelectedUnit) {
    return {
      tone: 'empty',
      title: '等待选择制作项',
      detail: '选择制作项后，交付包会汇总提示、素材、画面锚点、生成上下文和 AI 审稿状态。',
      progress: 0,
      blockers: ['未选择制作项'],
      metrics: [
        { label: '提示', value: '待选择', done: false },
        { label: '素材', value: '待选择', done: false },
        { label: '锚点', value: '待选择', done: false },
        { label: '上下文', value: '待选择', done: false },
        { label: '审稿', value: '待选择', done: false },
      ],
    }
  }

  const missingSlotCount = positiveInteger(input.missingSlotCount)
  const assetSlotCount = positiveInteger(input.assetSlotCount)
  const keyframeCount = positiveInteger(input.keyframeCount)
  const pendingReviewDraftCount = positiveInteger(input.pendingReviewDraftCount)
  const completedJobCount = positiveInteger(input.completedJobCount)
  const previewItemCount = positiveInteger(input.previewItemCount)
  const deliveryVersionCount = positiveInteger(input.deliveryVersionCount)
  const contextDone = input.generationContextReady && !input.generationContextLoading && !input.generationContextError
  const preGenerationBlockers = [
    input.hasPrompt ? '' : '补齐制作项描述或 prompt',
    missingSlotCount > 0 ? `补齐 ${missingSlotCount} 个素材需求` : '',
    keyframeCount > 0 ? '' : '添加至少一张画面锚点',
    input.generationContextError ? '修复生成上下文检查失败' : input.generationContextLoading ? '等待生成上下文检查完成' : contextDone ? '' : '补齐生成上下文检查',
    pendingReviewDraftCount > 0 ? `处理 ${pendingReviewDraftCount} 个 AI 草案` : '',
  ].filter(Boolean)
  const metrics: ContentWorkbenchDeliveryBriefMetric[] = [
    { label: '检查', value: preGenerationBlockers.length > 0 ? `${preGenerationBlockers.length} 阻塞` : '已通过', done: preGenerationBlockers.length === 0 },
    { label: '生成', value: completedJobCount > 0 ? `${completedJobCount} 完成` : '待执行', done: completedJobCount > 0 },
    { label: '预览', value: previewItemCount > 0 ? `${previewItemCount} 项` : '待挂载', done: previewItemCount > 0 },
    { label: '交付', value: deliveryVersionCount > 0 ? `${deliveryVersionCount} 版` : '待整理', done: deliveryVersionCount > 0 },
  ]
  const deliveryBlockers = preGenerationBlockers.length > 0
    ? [`生成检查仍有 ${preGenerationBlockers.length} 项阻塞`]
    : [
      completedJobCount > 0 ? '' : '执行生成任务',
      completedJobCount > 0 && previewItemCount === 0 ? '挂载生产预览' : '',
      previewItemCount > 0 && deliveryVersionCount === 0 ? '整理交付版本' : '',
    ].filter(Boolean)
  const blockers = deliveryBlockers
  const progress = Math.round((metrics.filter((metric) => metric.done).length / metrics.length) * 100)

  if (blockers.length === 0 && deliveryVersionCount > 0) {
    return {
      tone: 'ready',
      title: '交付包已闭环',
      detail: `${firstText(input.unitTitle, '当前制作项')} 已有生成、预览和交付版本记录。`,
      progress,
      blockers,
      metrics,
    }
  }

  if (preGenerationBlockers.length === 0) {
    return {
      tone: 'ready',
      title: completedJobCount === 0 ? '交付包可进入生成' : previewItemCount === 0 ? '交付包待预览' : '交付包待交付',
      detail: completedJobCount === 0
        ? `${firstText(input.unitTitle, '当前制作项')} 的核心输入已经齐备，可以打开生成画布。`
        : previewItemCount === 0
          ? '已有生成记录，下一步应挂到生产预览检查连续性。'
          : '预览记录已经存在，下一步应整理交付版本。',
      progress,
      blockers,
      metrics,
    }
  }

  const tone: ContentWorkbenchDeliveryBriefTone = input.generationContextLoading ? 'warning' : 'blocked'
  return {
    tone,
    title: tone === 'warning' ? '交付包检查中' : '交付包仍有阻塞',
    detail: `${firstText(input.unitTitle, '当前制作项')} 还有 ${preGenerationBlockers.length} 项生成前检查需要处理。`,
    progress,
    blockers,
    metrics,
  }
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
