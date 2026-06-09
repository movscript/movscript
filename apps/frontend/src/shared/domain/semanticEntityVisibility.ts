export function isActiveSemanticEntityRecord(record: Record<string, unknown>) {
  return !Boolean(record.__delete ?? record.deleted)
}
