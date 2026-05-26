import { isRecord } from '../valueUtils'

export function collectSeedSourceVersions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = item.ID ?? item.id
      const updatedAt = item.UpdatedAt ?? item.updatedAt
      return id !== undefined || updatedAt !== undefined ? [{ id, updatedAt }] : []
    })
  }
  if (isRecord(value)) {
    return {
      id: value.ID ?? value.id ?? value.scriptVersionId,
      updatedAt: value.UpdatedAt ?? value.updatedAt ?? value.scriptVersionUpdatedAt,
    }
  }
  return null
}
