export type ContentWorkbenchReviewTone = 'default' | 'warning' | 'success'

export interface ContentWorkbenchReviewDraftLike {
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
  tone: ContentWorkbenchReviewTone
  title: string
  detail: string
  actionLabel: string
}

export function buildContentWorkbenchReviewQueueSummary(input: {
  drafts: ContentWorkbenchReviewDraftLike[]
  selectedReview?: ContentWorkbenchSelectedReview | null
}): ContentWorkbenchReviewQueueSummary {
  const total = input.drafts.length
  const pending = input.drafts.filter((draft) => {
    const status = normalizeDraftStatus(draft.status)
    return status === 'draft' || status === 'accepted'
  }).length
  const applied = input.drafts.filter((draft) => normalizeDraftStatus(draft.status) === 'applied').length
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
      tone: 'default',
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
      tone: 'warning',
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
      tone: 'warning',
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
    tone: 'success',
    title: '草案队列已处理',
    detail: applied > 0 ? `${applied} 个 AI 草案已处理，可继续推进生成门禁。` : 'AI 草案队列没有待审项。',
    actionLabel: '查看审稿记录',
  }
}

function normalizeDraftStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}
