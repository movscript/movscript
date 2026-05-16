export type ContentWorkbenchPipelineStepKey =
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'content_units'
  | 'keyframes'
  | 'assets'
  | 'generation_context'
  | 'ai_review'
  | 'generation_plan'
  | 'preview_delivery'

export type ContentWorkbenchPipelineTone = 'done' | 'current' | 'blocked' | 'pending'

export interface ContentWorkbenchPipelineInput {
  productionTitle?: string
  segmentTitle?: string
  sceneMomentTitle?: string
  selectedUnitTitle?: string
  unitCount: number
  keyframeCount: number
  missingSlotCount: number
  generationContextReady: boolean
  pendingReviewDraftCount: number
  runningJobCount: number
  completedJobCount: number
  previewItemCount?: number
  deliveryVersionCount?: number
}

export interface ContentWorkbenchPipelineStep {
  key: ContentWorkbenchPipelineStepKey
  label: string
  value: string
  detail: string
  tone: ContentWorkbenchPipelineTone
}

export interface ContentWorkbenchPipelineSummary {
  title: string
  detail: string
  currentKey: ContentWorkbenchPipelineStepKey
  blockedCount: number
  steps: ContentWorkbenchPipelineStep[]
}

export function buildContentWorkbenchPipeline(input: ContentWorkbenchPipelineInput): ContentWorkbenchPipelineSummary {
  const normalized = {
    productionTitle: firstText(input.productionTitle),
    segmentTitle: firstText(input.segmentTitle),
    sceneMomentTitle: firstText(input.sceneMomentTitle),
    selectedUnitTitle: firstText(input.selectedUnitTitle),
    unitCount: positiveInteger(input.unitCount),
    keyframeCount: positiveInteger(input.keyframeCount),
    missingSlotCount: positiveInteger(input.missingSlotCount),
    generationContextReady: Boolean(input.generationContextReady),
    pendingReviewDraftCount: positiveInteger(input.pendingReviewDraftCount),
    runningJobCount: positiveInteger(input.runningJobCount),
    completedJobCount: positiveInteger(input.completedJobCount),
    previewItemCount: positiveInteger(input.previewItemCount),
    deliveryVersionCount: positiveInteger(input.deliveryVersionCount),
  }

  const baseSteps: Array<Omit<ContentWorkbenchPipelineStep, 'tone'> & { blocked: boolean; pending?: boolean }> = [
    {
      key: 'production',
      label: '制作',
      value: normalized.productionTitle || '未选择',
      detail: normalized.productionTitle ? '生产目标已锁定' : '先选择或建立制作目标',
      blocked: !normalized.productionTitle,
    },
    {
      key: 'segment',
      label: '情绪段',
      value: normalized.segmentTitle || '未绑定',
      detail: normalized.segmentTitle ? '承接节奏与情绪目标' : '需要关联情绪段',
      blocked: !normalized.segmentTitle,
    },
    {
      key: 'scene_moment',
      label: '情节',
      value: normalized.sceneMomentTitle || '未选择',
      detail: normalized.sceneMomentTitle ? '当前编排入口已定位' : '选择情节后进入拆分',
      blocked: !normalized.sceneMomentTitle,
    },
    {
      key: 'content_units',
      label: '制作项',
      value: normalized.unitCount > 0 ? `${normalized.unitCount} 个` : '待拆',
      detail: normalized.selectedUnitTitle || (normalized.unitCount > 0 ? '选择一个制作项继续执行' : '让 AI 或人工拆出生成目标'),
      blocked: normalized.unitCount === 0,
    },
    {
      key: 'keyframes',
      label: '画面锚点',
      value: normalized.keyframeCount > 0 ? `${normalized.keyframeCount} 帧` : '待补',
      detail: normalized.keyframeCount > 0 ? '可检查镜头连续性' : '至少补首尾关键帧',
      blocked: normalized.keyframeCount === 0,
    },
    {
      key: 'assets',
      label: '素材需求',
      value: normalized.missingSlotCount > 0 ? `${normalized.missingSlotCount} 缺口` : '可用',
      detail: normalized.missingSlotCount > 0 ? '素材缺口会阻塞生成' : '素材输入没有显性阻塞',
      blocked: normalized.missingSlotCount > 0,
    },
    {
      key: 'generation_context',
      label: '生成上下文',
      value: normalized.generationContextReady ? '可用' : '待检查',
      detail: normalized.generationContextReady ? '剧本、设定、提示已汇总' : '选择制作项后检查上下文门禁',
      blocked: !normalized.generationContextReady,
    },
    {
      key: 'ai_review',
      label: 'AI 审稿',
      value: normalized.pendingReviewDraftCount > 0 ? `${normalized.pendingReviewDraftCount} 待审` : '已清空',
      detail: normalized.pendingReviewDraftCount > 0 ? '处理草案后再进入生成计划' : '没有待处理草案',
      blocked: normalized.pendingReviewDraftCount > 0,
    },
    {
      key: 'generation_plan',
      label: '生成计划',
      value: normalized.runningJobCount > 0 ? `${normalized.runningJobCount} 运行中` : normalized.completedJobCount > 0 ? `${normalized.completedJobCount} 完成` : '待启动',
      detail: normalized.runningJobCount > 0 ? '正在执行生成任务' : normalized.completedJobCount > 0 ? '已有可追溯生成记录' : '门禁通过后进入画布执行',
      blocked: false,
      pending: normalized.runningJobCount === 0 && normalized.completedJobCount === 0,
    },
    {
      key: 'preview_delivery',
      label: '预览交付',
      value: normalized.deliveryVersionCount > 0 ? `${normalized.deliveryVersionCount} 版本` : normalized.previewItemCount > 0 ? `${normalized.previewItemCount} 预览` : '待编排',
      detail: normalized.deliveryVersionCount > 0 ? '已有交付版本记录' : normalized.previewItemCount > 0 ? '已有预览时间线挂载' : '生成结果需要进入预览和交付',
      blocked: false,
      pending: normalized.previewItemCount === 0 && normalized.deliveryVersionCount === 0,
    },
  ]

  const firstBlockedIndex = baseSteps.findIndex((step) => step.blocked)
  const firstPendingIndex = baseSteps.findIndex((step) => step.pending)
  const currentIndex = firstBlockedIndex >= 0
    ? firstBlockedIndex
    : firstPendingIndex >= 0
      ? firstPendingIndex
      : baseSteps.length - 1
  const steps = baseSteps.map((step, index) => ({
    key: step.key,
    label: step.label,
    value: step.value,
    detail: step.detail,
    tone: step.blocked
      ? (index === currentIndex ? 'current' : 'blocked')
      : step.pending
        ? 'pending'
        : 'done',
  } satisfies ContentWorkbenchPipelineStep))
  const current = steps[currentIndex] ?? steps[0]
  const blockedCount = baseSteps.filter((step) => step.blocked).length

  return {
    title: blockedCount > 0 ? '生产链路仍有阻塞' : current.key === 'preview_delivery' && current.tone === 'done' ? '生产链路已交付' : current.key === 'preview_delivery' ? '生产链路待交付' : '生产链路可进入生成',
    detail: blockedCount > 0 ? `当前卡点：${current.label}，${current.detail}。` : current.key === 'preview_delivery' && current.tone === 'done' ? '制作、生成、预览和交付记录已经闭环。' : current.key === 'preview_delivery' ? '生成结果还需要进入预览或交付版本。' : '制作项、锚点、素材、上下文和审稿状态都已打通。',
    currentKey: current.key,
    blockedCount,
    steps,
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
