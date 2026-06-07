export function isActiveSemanticEntityRecord(record: { __delete?: unknown; deleted?: unknown }) {
  return !Boolean(record.__delete ?? record.deleted)
}
