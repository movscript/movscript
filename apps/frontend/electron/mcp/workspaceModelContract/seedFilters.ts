import { isRecord } from '../valueUtils'
import { normalizedStringField } from './utils'

const inactiveWorkspaceSeedCreativeReferenceStatuses = new Set(['ignored', 'merged'])
const inactiveWorkspaceSeedAssetSlotStatuses = new Set(['ignored', 'waived', 'merged'])

export function activeWorkspaceSeedCreativeReferences(references: any[]): any[] {
  return references.filter((reference) => {
    if (!isRecord(reference)) return false
    const status = normalizedStringField(reference, 'status')
    return !status || !inactiveWorkspaceSeedCreativeReferenceStatuses.has(status)
  })
}

export function activeWorkspaceSeedAssetSlots(slots: any[]): any[] {
  return slots.filter((slot) => {
    if (!isRecord(slot)) return false
    const status = normalizedStringField(slot, 'status')
    return !status || !inactiveWorkspaceSeedAssetSlotStatuses.has(status)
  })
}
