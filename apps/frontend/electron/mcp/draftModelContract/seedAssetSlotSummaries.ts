import { isRecord } from '../valueUtils'

export function summarizeAssetSlotOwnership(slots: unknown[]): unknown[] {
  return slots.flatMap((slot) => {
    if (!isRecord(slot)) return []
    const id = slot.ID ?? slot.id
    return [{
      id,
      owner_type: slot.owner_type,
      owner_id: slot.owner_id,
      creative_reference_id: slot.creative_reference_id,
      production_id: slot.production_id,
      UpdatedAt: slot.UpdatedAt ?? slot.updatedAt,
    }]
  })
}
