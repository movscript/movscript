import { isRecord } from '../valueUtils'
import { normalizedStringField } from './utils'

const inactiveDraftSeedCreativeReferenceStatuses = new Set(['ignored', 'merged'])
const inactiveDraftSeedAssetSlotStatuses = new Set(['ignored', 'waived', 'merged'])

export function activeDraftSeedCreativeReferences(references: any[]): any[] {
  return references.filter((reference) => {
    if (!isRecord(reference)) return false
    const status = normalizedStringField(reference, 'status')
    return !status || !inactiveDraftSeedCreativeReferenceStatuses.has(status)
  })
}

export function activeDraftSeedAssetSlots(slots: any[]): any[] {
  return slots.filter((slot) => {
    if (!isRecord(slot)) return false
    const status = normalizedStringField(slot, 'status')
    return !status || !inactiveDraftSeedAssetSlotStatuses.has(status)
  })
}
