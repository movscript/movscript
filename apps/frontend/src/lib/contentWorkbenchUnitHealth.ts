export type ContentWorkbenchUnitHealthTone = 'empty' | 'blocked' | 'warning' | 'ready' | 'done'

export type ContentWorkbenchUnitHealthCheckTone = 'blocked' | 'warning' | 'ready' | 'done'

export interface ContentWorkbenchUnitHealthInput {
  hasSelectedUnit: boolean
  hasPrompt: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  generationContextReady: boolean
  generationContextLoading: boolean
  generationContextError: boolean
  pendingReviewDraftCount: number
  runningJobCount: number
  completedJobCount: number
  previewItemCount?: number
  deliveryVersionCount?: number
}

export interface ContentWorkbenchUnitHealthCheck {
  key: string
  label: string
  value: string
  tone: ContentWorkbenchUnitHealthCheckTone
  done: boolean
  weight: number
}

export interface ContentWorkbenchUnitHealth {
  tone: ContentWorkbenchUnitHealthTone
  title: string
  detail: string
  score: number
  checks: ContentWorkbenchUnitHealthCheck[]
}

export function buildContentWorkbenchUnitHealth(input: ContentWorkbenchUnitHealthInput): ContentWorkbenchUnitHealth {
  if (!input.hasSelectedUnit) {
    return {
      tone: 'empty',
      title: '等待选择制作项',
      detail: '选择制作项后，系统会评估提示、素材、画面锚点、上下文、审稿和交付进度。',
      score: 0,
      checks: [],
    }
  }

  const assetSlotCount = positiveInteger(input.assetSlotCount)
  const missingSlotCount = positiveInteger(input.missingSlotCount)
  const keyframeCount = positiveInteger(input.keyframeCount)
  const pendingReviewDraftCount = positiveInteger(input.pendingReviewDraftCount)
  const runningJobCount = positiveInteger(input.runningJobCount)
  const completedJobCount = positiveInteger(input.completedJobCount)
  const previewItemCount = positiveInteger(input.previewItemCount)
  const deliveryVersionCount = positiveInteger(input.deliveryVersionCount)
  const contextReady = input.generationContextReady && !input.generationContextLoading && !input.generationContextError

  const checks: ContentWorkbenchUnitHealthCheck[] = [
    {
      key: 'prompt',
      label: '目标提示',
      value: input.hasPrompt ? '可读' : '待补',
      tone: input.hasPrompt ? 'ready' : 'blocked',
      done: input.hasPrompt,
      weight: 20,
    },
    {
      key: 'assets',
      label: '素材输入',
      value: missingSlotCount > 0 ? `${missingSlotCount} 缺口` : assetSlotCount > 0 ? `${assetSlotCount} 项` : '无显性缺口',
      tone: missingSlotCount > 0 ? 'blocked' : 'ready',
      done: missingSlotCount === 0,
      weight: 20,
    },
    {
      key: 'keyframes',
      label: '画面锚点',
      value: keyframeCount > 0 ? `${keyframeCount} 帧` : '待补',
      tone: keyframeCount > 0 ? 'ready' : 'blocked',
      done: keyframeCount > 0,
      weight: 20,
    },
    {
      key: 'generation_context',
      label: '生成上下文',
      value: input.generationContextError ? '失败' : input.generationContextLoading ? '检查中' : contextReady ? '可用' : '待补',
      tone: input.generationContextLoading ? 'warning' : contextReady ? 'ready' : 'blocked',
      done: contextReady,
      weight: 20,
    },
    {
      key: 'ai_review',
      label: 'AI 审稿',
      value: pendingReviewDraftCount > 0 ? `${pendingReviewDraftCount} 待审` : '已处理',
      tone: pendingReviewDraftCount > 0 ? 'warning' : 'ready',
      done: pendingReviewDraftCount === 0,
      weight: 10,
    },
    {
      key: 'generation',
      label: '生成记录',
      value: runningJobCount > 0 ? `${runningJobCount} 运行中` : completedJobCount > 0 ? `${completedJobCount} 完成` : '待启动',
      tone: completedJobCount > 0 ? 'done' : runningJobCount > 0 ? 'warning' : 'warning',
      done: completedJobCount > 0,
      weight: 5,
    },
    {
      key: 'delivery',
      label: '预览交付',
      value: deliveryVersionCount > 0 ? `${deliveryVersionCount} 版本` : previewItemCount > 0 ? `${previewItemCount} 预览` : '待挂载',
      tone: deliveryVersionCount > 0 ? 'done' : previewItemCount > 0 ? 'ready' : 'warning',
      done: deliveryVersionCount > 0,
      weight: 5,
    },
  ]

  const score = Math.round(checks.reduce((sum, check) => sum + (check.done ? check.weight : 0), 0))
  const hardBlockers = checks.filter((check) => check.tone === 'blocked').length
  const warnings = checks.filter((check) => check.tone === 'warning').length

  if (deliveryVersionCount > 0 && score === 100) {
    return {
      tone: 'done',
      title: '制作项已闭环',
      detail: '核心输入、生成记录、预览和交付版本已经形成可追溯闭环。',
      score,
      checks,
    }
  }

  if (hardBlockers > 0) {
    return {
      tone: 'blocked',
      title: '制作项不可执行',
      detail: `${hardBlockers} 个硬性门禁仍在阻塞生成。`,
      score,
      checks,
    }
  }

  if (warnings > 0) {
    return {
      tone: score >= 90 ? 'ready' : 'warning',
      title: score >= 90 ? '制作项可进入生产' : '制作项接近可执行',
      detail: score >= 90 ? '核心输入已经齐备，继续补齐预览或交付记录。' : `${warnings} 个生产后置环节仍需推进。`,
      score,
      checks,
    }
  }

  return {
    tone: 'ready',
    title: '制作项可执行',
    detail: '提示、素材、画面锚点、上下文和审稿状态均已通过。',
    score,
    checks,
  }
}

function positiveInteger(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0))
}
