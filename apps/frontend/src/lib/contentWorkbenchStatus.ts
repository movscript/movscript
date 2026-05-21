import type { WorkbenchDecisionRow, WorkbenchScenarioPriority, WorkbenchScenarioStatus } from './workbenchScenarios.ts'

export type ContentWorkbenchStatusRecord = {
  status?: string
  resource_id?: unknown
}

export function statusLabel(status: WorkbenchScenarioStatus) {
  if (status === 'blocked') return '阻塞'
  if (status === 'ready') return '可推进'
  if (status === 'running') return '运行中'
  return '待确认'
}

export function statusVariant(status: WorkbenchScenarioStatus) {
  if (status === 'blocked') return 'warning' as const
  if (status === 'ready') return 'success' as const
  if (status === 'running') return 'secondary' as const
  return 'outline' as const
}

export function priorityLabel(priority: WorkbenchScenarioPriority) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

export function decisionVariant(tone?: WorkbenchDecisionRow['tone']) {
  if (tone === 'success') return 'success' as const
  if (tone === 'warning') return 'warning' as const
  return 'outline' as const
}

export function normalizeAssetSlotStatus(status?: string) {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

export function assetSlotWorkStatus(slot: ContentWorkbenchStatusRecord, lockedSlot?: ContentWorkbenchStatusRecord) {
  const status = normalizeAssetSlotStatus(slot.status)
  if (status === 'locked' || status === 'waived' || lockedSlot || slot.resource_id) return 'ready'
  return 'review'
}

export function contentUnitWorkStatus(unit: ContentWorkbenchStatusRecord, missingSlots: ContentWorkbenchStatusRecord[]): WorkbenchScenarioStatus {
  if (missingSlots.length > 0) return 'blocked'
  if (unit.status === 'in_production') return 'running'
  if (unit.status === 'locked') return 'ready'
  if (unit.status === 'confirmed') return 'ready'
  return 'review'
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: { message?: unknown; error?: unknown } } }).response?.data
    const message = firstText(data?.message, data?.error)
    if (message) return message
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export function resourceFileUrl(resourceId?: number | null) {
  return resourceId ? `/api/v1/resources/${resourceId}/file` : ''
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
