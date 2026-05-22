import type { SemanticEntityRecord } from '@/api/semanticEntities'

export const inactiveSemanticEntityStatuses = ['ignored', 'merged', 'removed', 'abandoned']

export function isActiveSemanticEntityRecord(record: Pick<SemanticEntityRecord, 'status'>) {
  return !inactiveSemanticEntityStatuses.includes(String(record.status ?? '').toLowerCase())
}
