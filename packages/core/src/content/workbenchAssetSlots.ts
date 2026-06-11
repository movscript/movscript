export type ContentWorkbenchAssetSlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'
export type ContentWorkbenchWorkStatus = 'blocked' | 'review' | 'ready' | 'running'

export interface ContentWorkbenchStatusRecord {
  status?: string
  resource_id?: unknown
}

export interface ContentWorkbenchUploadSlot {
  ID: number
  status?: string
}

export interface ContentWorkbenchUploadTargetInput<T extends ContentWorkbenchUploadSlot> {
  selectedUnitAssetSlots: T[]
  momentAssetSlots: T[]
}

export function normalizeAssetSlotStatus(status?: string): ContentWorkbenchAssetSlotStatus {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

export function assetSlotWorkStatus(
  slot: ContentWorkbenchStatusRecord,
  lockedSlot?: ContentWorkbenchStatusRecord,
): ContentWorkbenchWorkStatus {
  const status = normalizeAssetSlotStatus(slot.status)
  if (status === 'locked' || status === 'waived' || lockedSlot || slot.resource_id) return 'ready'
  return 'review'
}

export function contentUnitWorkStatus(
  unit: ContentWorkbenchStatusRecord,
  missingSlots: ContentWorkbenchStatusRecord[],
): ContentWorkbenchWorkStatus {
  if (missingSlots.length > 0) return 'blocked'
  if (unit.status === 'in_production') return 'running'
  if (unit.status === 'locked') return 'ready'
  if (unit.status === 'confirmed') return 'ready'
  return 'review'
}

export function pickContentWorkbenchUploadTarget<T extends ContentWorkbenchUploadSlot>(
  input: ContentWorkbenchUploadTargetInput<T>,
): T | null {
  const selectedUnitMissingSlot = input.selectedUnitAssetSlots.find((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  if (selectedUnitMissingSlot) return selectedUnitMissingSlot
  if (input.selectedUnitAssetSlots[0]) return input.selectedUnitAssetSlots[0]

  const momentMissingSlot = input.momentAssetSlots.find((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  return momentMissingSlot ?? input.momentAssetSlots[0] ?? null
}
