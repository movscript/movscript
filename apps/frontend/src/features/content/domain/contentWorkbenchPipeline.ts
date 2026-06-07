export type ContentWorkbenchPipelineStepKey =
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'content_units'
  | 'keyframes'
  | 'assets'
  | 'generation_context'
  | 'ai_review'
  | 'generation_taskGraph'
  | 'preview'

export type ContentWorkbenchPipelineState = 'done' | 'current' | 'blocked' | 'pending'

export interface ContentWorkbenchPipelineInput {
  productionTitle?: string
  segmentTitle?: string
  sceneMomentTitle?: string
  selectedUnitTitle?: string
  unitCount: number
  keyframeCount: number
  missingSlotCount: number
  generationContextReady: boolean
  pendingReviewWorkspaceCount: number
  runningJobCount: number
  completedJobCount: number
  previewItemCount?: number
}

export interface ContentWorkbenchPipelineStep {
  key: ContentWorkbenchPipelineStepKey
  label: string
  value: string
  detail: string
  state: ContentWorkbenchPipelineState
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
    pendingReviewWorkspaceCount: positiveInteger(input.pendingReviewWorkspaceCount),
    runningJobCount: positiveInteger(input.runningJobCount),
    completedJobCount: positiveInteger(input.completedJobCount),
    previewItemCount: positiveInteger(input.previewItemCount),
  }

  const baseSteps: Array<Omit<ContentWorkbenchPipelineStep, 'state'> & { blocked: boolean; pending?: boolean }> = [
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
      value: normalized.missingSlotCount > 0 ? `${normalized.missingSlotCount} 缺口` : '已覆盖',
      detail: normalized.missingSlotCount > 0 ? '先补齐素材需求再进入生成' : '素材输入已覆盖当前生成需要',
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
      value: normalized.pendingReviewWorkspaceCount > 0 ? `${normalized.pendingReviewWorkspaceCount} 待审` : '已清空',
      detail: normalized.pendingReviewWorkspaceCount > 0 ? '处理草案后再进入生成计划' : '没有待处理草案',
      blocked: normalized.pendingReviewWorkspaceCount > 0,
    },
    {
      key: 'generation_taskGraph',
      label: '生成计划',
      value: normalized.runningJobCount > 0 ? `${normalized.runningJobCount} 运行中` : normalized.completedJobCount > 0 ? `${normalized.completedJobCount} 完成` : '待启动',
      detail: normalized.runningJobCount > 0 ? '正在执行生成任务' : normalized.completedJobCount > 0 ? '已有可追溯生成记录' : '门禁通过后进入画布执行',
      blocked: false,
      pending: normalized.runningJobCount === 0 && normalized.completedJobCount === 0,
    },
    {
      key: 'preview',
      label: '预览检查',
      value: normalized.previewItemCount > 0 ? `${normalized.previewItemCount} 预览` : '待编排',
      detail: normalized.previewItemCount > 0 ? '已有预览时间线挂载' : '生成结果需要进入预览检查',
      blocked: false,
      pending: normalized.previewItemCount === 0,
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
    state: step.blocked
      ? (index === currentIndex ? 'current' : 'blocked')
      : step.pending
        ? 'pending'
        : 'done',
  } satisfies ContentWorkbenchPipelineStep))
  const current = steps[currentIndex] ?? steps[0]
  const blockedCount = baseSteps.filter((step) => step.blocked).length

  return {
    title: blockedCount > 0 ? `下一步：${current.label}` : current.key === 'preview' && current.state === 'done' ? '生产链路已预览' : current.key === 'preview' ? '下一步：预览检查' : '下一步：启动生成',
    detail: blockedCount > 0 ? current.detail : current.key === 'preview' && current.state === 'done' ? '制作、生成和预览记录已经闭环。' : current.key === 'preview' ? '生成结果还需要进入预览检查。' : '制作项、锚点、素材、上下文和审稿状态都已打通。',
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
