export type ContentWorkbenchReviewQueueState = 'empty' | 'needs_review' | 'pending_review' | 'processed'

export interface ContentWorkbenchReviewWorkspaceLike {
  status?: string
}

export interface ContentWorkbenchSelectedReview {
  warningCount: number
  diffCount: number
  addedCount: number
  changedCount: number
}

export interface ContentWorkbenchReviewQueueSummary {
  total: number
  pending: number
  applied: number
  inactive: number
  warningCount: number
  diffCount: number
  addedCount: number
  changedCount: number
  state: ContentWorkbenchReviewQueueState
  title: string
  detail: string
  actionLabel: string
}

export function buildContentWorkbenchReviewQueueSummary(input: {
  workspaces: ContentWorkbenchReviewWorkspaceLike[]
  selectedReview?: ContentWorkbenchSelectedReview | null
}): ContentWorkbenchReviewQueueSummary {
  const total = input.workspaces.length
  const pending = input.workspaces.filter((workspace) => {
    const status = normalizeWorkspaceStatus(workspace.status)
    return status === 'workspace' || status === 'accepted'
  }).length
  const applied = input.workspaces.filter((workspace) => normalizeWorkspaceStatus(workspace.status) === 'applied').length
  const inactive = Math.max(0, total - pending - applied)
  const warningCount = input.selectedReview?.warningCount ?? 0
  const diffCount = input.selectedReview?.diffCount ?? 0
  const addedCount = input.selectedReview?.addedCount ?? 0
  const changedCount = input.selectedReview?.changedCount ?? 0

  if (total === 0) {
    return {
      total,
      pending,
      applied,
      inactive,
      warningCount,
      diffCount,
      addedCount,
      changedCount,
      state: 'empty',
      title: '暂无 AI 草案',
      detail: '可以让 AI 先生成制作项快照，再进入人工审稿。',
      actionLabel: '生成 AI 草案',
    }
  }

  if (warningCount > 0) {
    return {
      total,
      pending,
      applied,
      inactive,
      warningCount,
      diffCount,
      addedCount,
      changedCount,
      state: 'needs_review',
      title: '草案需要复核',
      detail: `${warningCount} 个审稿风险需要人工确认，建议先处理当前选中的 AI 草案。`,
      actionLabel: '审阅 AI 草案',
    }
  }

  if (pending > 0) {
    return {
      total,
      pending,
      applied,
      inactive,
      warningCount,
      diffCount,
      addedCount,
      changedCount,
      state: 'pending_review',
      title: 'AI 草案待审',
      detail: `${pending} 个制作项草案仍在等待确认，当前草案包含 ${diffCount} 个快照差异。`,
      actionLabel: '审阅 AI 草案',
    }
  }

  return {
    total,
    pending,
    applied,
    inactive,
    warningCount,
    diffCount,
    addedCount,
    changedCount,
    state: 'processed',
    title: '草案队列已处理',
    detail: applied > 0 ? `${applied} 个 AI 草案已处理，可继续推进生成检查。` : 'AI 草案队列没有待审项。',
    actionLabel: '查看审稿记录',
  }
}

function normalizeWorkspaceStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}
