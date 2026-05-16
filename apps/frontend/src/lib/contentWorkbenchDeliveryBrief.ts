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
  const contextDone = input.generationContextReady && !input.generationContextLoading && !input.generationContextError
  const contextValue = input.generationContextError
    ? '失败'
    : input.generationContextLoading
      ? '检查中'
      : contextDone
        ? '可用'
        : '待补'
  const metrics: ContentWorkbenchDeliveryBriefMetric[] = [
    { label: '提示', value: input.hasPrompt ? '可用' : '待补', done: input.hasPrompt },
    { label: '素材', value: missingSlotCount > 0 ? `${missingSlotCount} 缺口` : assetSlotCount > 0 ? `${assetSlotCount} 项` : '无缺口', done: missingSlotCount === 0 },
    { label: '锚点', value: keyframeCount > 0 ? `${keyframeCount} 帧` : '待补', done: keyframeCount > 0 },
    { label: '上下文', value: contextValue, done: contextDone },
    { label: '审稿', value: pendingReviewDraftCount > 0 ? `${pendingReviewDraftCount} 待审` : '已处理', done: pendingReviewDraftCount === 0 },
  ]
  const blockers = [
    input.hasPrompt ? '' : '补齐制作项描述或 prompt',
    missingSlotCount > 0 ? `补齐 ${missingSlotCount} 个素材需求` : '',
    keyframeCount > 0 ? '' : '添加至少一张画面锚点',
    input.generationContextError ? '修复生成上下文检查失败' : input.generationContextLoading ? '等待生成上下文检查完成' : contextDone ? '' : '补齐生成上下文门禁',
    pendingReviewDraftCount > 0 ? `处理 ${pendingReviewDraftCount} 个 AI 草案` : '',
  ].filter(Boolean)
  const progress = Math.round((metrics.filter((metric) => metric.done).length / metrics.length) * 100)

  if (blockers.length === 0) {
    return {
      tone: 'ready',
      title: '交付包可进入生成',
      detail: `${firstText(input.unitTitle, '当前制作项')} 的核心输入已经齐备，可以打开生成画布。`,
      progress,
      blockers,
      metrics,
    }
  }

  const tone: ContentWorkbenchDeliveryBriefTone = input.generationContextLoading ? 'warning' : 'blocked'
  return {
    tone,
    title: tone === 'warning' ? '交付包检查中' : '交付包仍有阻塞',
    detail: `${firstText(input.unitTitle, '当前制作项')} 还有 ${blockers.length} 项需要处理。`,
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
