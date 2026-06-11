export type ContentWorkbenchActivityState = 'done' | 'running' | 'blocked' | 'pending'
export type ContentWorkbenchActivityFeedState = 'waiting_focus' | 'needs_attention' | 'running' | 'traceable' | 'idle'
export type ContentWorkbenchActivityActionKey = 'select_unit' | 'review_ai_workspaces'

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
  pendingReviewWorkspaceCount: number
  jobs: ContentWorkbenchActivityJobLike[]
}

export interface CoreContentWorkbenchActivityItem {
  key: string
  kind: 'select_unit' | 'review_workspaces' | 'job_empty' | 'job'
  state: ContentWorkbenchActivityState
  actionKey?: ContentWorkbenchActivityActionKey
  pendingReviewWorkspaceCount?: number
  job?: {
    id: string | number
    title: string
    type: string
    status: string
    error: string
    outputResourceIds: number[]
  }
}

export interface CoreContentWorkbenchActivityFeed {
  state: ContentWorkbenchActivityFeedState
  selectedUnitTitle: string
  blockedCount: number
  runningCount: number
  recordCount: number
  items: CoreContentWorkbenchActivityItem[]
}

export function buildContentWorkbenchActivityState(
  input: ContentWorkbenchActivityInput,
): CoreContentWorkbenchActivityFeed {
  const selectedUnitTitle = firstText(input.selectedUnitTitle)
  if (!input.hasSelectedUnit) {
    return {
      state: 'waiting_focus',
      selectedUnitTitle,
      blockedCount: 0,
      runningCount: 0,
      recordCount: 1,
      items: [{
        key: 'select-unit',
        kind: 'select_unit',
        state: 'pending',
        actionKey: 'select_unit',
      }],
    }
  }

  const items: CoreContentWorkbenchActivityItem[] = []
  const pendingReviewWorkspaceCount = positiveInteger(input.pendingReviewWorkspaceCount)

  if (pendingReviewWorkspaceCount > 0) {
    items.push({
      key: 'review-workspaces',
      kind: 'review_workspaces',
      state: 'blocked',
      actionKey: 'review_ai_workspaces',
      pendingReviewWorkspaceCount,
    })
  }

  items.push(...summarizeJobs(input.jobs))

  const visibleItems = items.slice(0, 5)
  const blockedCount = visibleItems.filter((item) => item.state === 'blocked').length
  const runningCount = visibleItems.filter((item) => item.state === 'running').length
  return {
    state: blockedCount > 0
      ? 'needs_attention'
      : runningCount > 0
        ? 'running'
        : visibleItems.some((item) => item.state === 'done')
          ? 'traceable'
          : 'idle',
    selectedUnitTitle,
    blockedCount,
    runningCount,
    recordCount: visibleItems.length,
    items: visibleItems,
  }
}

function summarizeJobs(jobs: ContentWorkbenchActivityJobLike[]): CoreContentWorkbenchActivityItem[] {
  const normalizedJobs = jobs.slice(0, 3)
  if (normalizedJobs.length === 0) {
    return [{
      key: 'job-empty',
      kind: 'job_empty',
      state: 'pending',
    }]
  }
  return normalizedJobs.map((job) => {
    const status = String(job.status ?? '').trim().toLowerCase()
    const title = firstText(job.title, `#${job.id}`)
    const type = firstText(job.type)
    const state: ContentWorkbenchActivityState = status === 'failed' || status === 'cancelled'
      ? 'blocked'
      : status === 'pending' || status === 'running'
        ? 'running'
        : 'done'
    return {
      key: `job-${job.id}`,
      kind: 'job',
      state,
      job: {
        id: job.id,
        title,
        type,
        status,
        error: firstText(job.error),
        outputResourceIds: uniquePositiveNumbers([
          ...(Array.isArray(job.outputResourceIds) ? job.outputResourceIds : []),
          job.outputResourceId,
        ]),
      },
    }
  })
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
