export interface ContentWorkbenchUploadSlot {
  ID: number
  status?: string
}

export interface ContentWorkbenchUploadTargetInput<T extends ContentWorkbenchUploadSlot> {
  selectedUnitAssetSlots: T[]
  momentAssetSlots: T[]
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

function normalizeAssetSlotStatus(status?: string) {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}
