export const inactiveSemanticEntityStatuses = ['ignored', 'merged', 'removed', 'abandoned']

export function isActiveSemanticEntityRecord(record: { status?: unknown }) {
  return !inactiveSemanticEntityStatuses.includes(String(record.status ?? '').toLowerCase())
}
