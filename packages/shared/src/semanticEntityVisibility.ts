export function isActiveSemanticEntityRecord(record: Record<string, unknown>): boolean {
  return !Boolean(record.__delete ?? record.deleted)
}
