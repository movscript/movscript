export type ContentWorkbenchUnitHealthState = 'empty' | 'blocked' | 'pending' | 'ready' | 'done'

export type ContentWorkbenchUnitHealthCheckState = 'blocked' | 'pending' | 'ready' | 'done'

export interface ContentWorkbenchUnitHealthInput {
  hasSelectedUnit: boolean
  hasPrompt: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  requiresKeyframe?: boolean
  generationContextReady: boolean
  generationContextLoading: boolean
  generationContextError: boolean
  pendingReviewWorkspaceCount: number
  runningJobCount: number
  completedJobCount: number
  previewItemCount?: number
}

export interface ContentWorkbenchUnitHealthCheck {
  key: string
  label: string
  value: string
  state: ContentWorkbenchUnitHealthCheckState
  done: boolean
  weight: number
}

export interface ContentWorkbenchUnitHealth {
  state: ContentWorkbenchUnitHealthState
  title: string
  detail: string
  score: number
  checks: ContentWorkbenchUnitHealthCheck[]
}

export function buildContentWorkbenchUnitHealth(input: ContentWorkbenchUnitHealthInput): ContentWorkbenchUnitHealth {
  if (!input.hasSelectedUnit) {
    return {
      state: 'empty',
      title: '等待选择制作项',
      detail: '选择制作项后，系统会评估提示、素材、画面锚点、上下文、审稿和预览进度。',
      score: 0,
      checks: [],
    }
  }

  const assetSlotCount = positiveInteger(input.assetSlotCount)
  const missingSlotCount = positiveInteger(input.missingSlotCount)
  const keyframeCount = positiveInteger(input.keyframeCount)
  const requiresKeyframe = input.requiresKeyframe ?? true
  const pendingReviewWorkspaceCount = positiveInteger(input.pendingReviewWorkspaceCount)
  const runningJobCount = positiveInteger(input.runningJobCount)
  const completedJobCount = positiveInteger(input.completedJobCount)
  const previewItemCount = positiveInteger(input.previewItemCount)
  const contextReady = input.generationContextReady && !input.generationContextLoading && !input.generationContextError

  const checks: ContentWorkbenchUnitHealthCheck[] = [
    {
      key: 'prompt',
      label: '目标提示',
      value: input.hasPrompt ? '可读' : '待补',
      state: input.hasPrompt ? 'ready' : 'blocked',
      done: input.hasPrompt,
      weight: 20,
    },
    {
      key: 'assets',
      label: '素材输入',
      value: missingSlotCount > 0 ? `${missingSlotCount} 缺口` : assetSlotCount > 0 ? `${assetSlotCount} 项` : '无显性缺口',
      state: missingSlotCount > 0 ? 'blocked' : 'ready',
      done: missingSlotCount === 0,
      weight: 20,
    },
    {
      key: 'keyframes',
      label: '画面锚点',
      value: requiresKeyframe ? (keyframeCount > 0 ? `${keyframeCount} 帧` : '待补') : '非画面项',
      state: requiresKeyframe && keyframeCount === 0 ? 'blocked' : 'ready',
      done: !requiresKeyframe || keyframeCount > 0,
      weight: 20,
    },
    {
      key: 'generation_context',
      label: '生成上下文',
      value: input.generationContextError ? '失败' : input.generationContextLoading ? '检查中' : contextReady ? '可用' : '待补',
      state: input.generationContextLoading ? 'pending' : contextReady ? 'ready' : 'blocked',
      done: contextReady,
      weight: 20,
    },
    {
      key: 'ai_review',
      label: 'AI 审稿',
      value: pendingReviewWorkspaceCount > 0 ? `${pendingReviewWorkspaceCount} 待审` : '已处理',
      state: pendingReviewWorkspaceCount > 0 ? 'pending' : 'ready',
      done: pendingReviewWorkspaceCount === 0,
      weight: 10,
    },
    {
      key: 'generation',
      label: '生成记录',
      value: runningJobCount > 0 ? `${runningJobCount} 运行中` : completedJobCount > 0 ? `${completedJobCount} 完成` : '待启动',
      state: completedJobCount > 0 ? 'done' : 'pending',
      done: completedJobCount > 0,
      weight: 5,
    },
    {
      key: 'preview',
      label: '预览挂载',
      value: previewItemCount > 0 ? `${previewItemCount} 预览` : '待挂载',
      state: previewItemCount > 0 ? 'done' : 'pending',
      done: previewItemCount > 0,
      weight: 5,
    },
  ]

  const score = Math.round(checks.reduce((sum, check) => sum + (check.done ? check.weight : 0), 0))
  const hardBlockers = checks.filter((check) => check.state === 'blocked').length
  const pendingCount = checks.filter((check) => check.state === 'pending').length

  if (previewItemCount > 0 && score === 100) {
    return {
      state: 'done',
      title: '制作项已闭环',
      detail: '核心输入、生成记录和预览挂载已经形成可追溯闭环。',
      score,
      checks,
    }
  }

  if (hardBlockers > 0) {
    return {
      state: 'blocked',
      title: '下一步：补齐生成条件',
      detail: `${hardBlockers} 个硬性门禁需要先补齐。`,
      score,
      checks,
    }
  }

  if (pendingCount > 0) {
    return {
      state: score >= 90 ? 'ready' : 'pending',
      title: score >= 90 ? '制作项可进入生产' : '制作项接近可执行',
      detail: score >= 90 ? '核心输入已经齐备，继续补齐预览记录。' : `${pendingCount} 个生产后置环节仍需推进。`,
      score,
      checks,
    }
  }

  return {
    state: 'ready',
    title: '制作项可执行',
    detail: '提示、素材、画面锚点、上下文和审稿记录均已通过。',
    score,
    checks,
  }
}

function positiveInteger(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0))
}
