export interface SessionDeckEntry {
  id: string
  archived?: boolean
  createdAt?: number
  deckOrder?: number | null
  open?: boolean
  updatedAt?: number
}

export interface SessionDeckIndex {
  closedIds: Set<string>
  openIds: Set<string>
  orderIndex: Map<string, number>
}

export function buildSessionDeckIndex<TEntry extends SessionDeckEntry>(input: {
  entries: TEntry[]
  idForEntry?: (entry: TEntry) => string
}): SessionDeckIndex {
  const idForEntry = input.idForEntry ?? ((entry: TEntry) => entry.id)
  const indexed = input.entries.map((entry, index) => ({ entry, id: idForEntry(entry).trim(), index }))
    .filter((item) => item.id)
  const closedIds = new Set(indexed
    .filter((item) => item.entry.open === false)
    .map((item) => item.id))
  const openEntries = indexed
    .filter((item) => item.entry.open !== false && item.entry.archived !== true)
    .sort((left, right) => compareSessionDeckEntries(left, right))
  return {
    closedIds,
    openIds: new Set(openEntries.map((item) => item.id)),
    orderIndex: new Map(openEntries.map((item, index) => [item.id, index])),
  }
}

export function reorderSessionDeckEntries<TEntry extends SessionDeckEntry>(input: {
  entries: TEntry[]
  draggedId: string
  targetId: string
  position: 'before' | 'after'
  idForEntry?: (entry: TEntry) => string
}): Array<{ id: string; deckOrder: number }> {
  const draggedId = input.draggedId.trim()
  const targetId = input.targetId.trim()
  if (!draggedId || !targetId || draggedId === targetId) return []
  const idForEntry = input.idForEntry ?? ((entry: TEntry) => entry.id)
  const orderedIds = input.entries
    .map((entry, index) => ({ entry, id: idForEntry(entry).trim(), index }))
    .filter((item) => item.id && item.entry.open !== false && item.entry.archived !== true)
    .sort((left, right) => compareSessionDeckEntries(left, right))
    .map((item) => item.id)
  const draggedIndex = orderedIds.indexOf(draggedId)
  const targetIndex = orderedIds.indexOf(targetId)
  if (draggedIndex < 0 || targetIndex < 0) return []
  orderedIds.splice(draggedIndex, 1)
  const nextTargetIndex = orderedIds.indexOf(targetId)
  const insertIndex = input.position === 'after' ? nextTargetIndex + 1 : nextTargetIndex
  orderedIds.splice(insertIndex, 0, draggedId)
  return orderedIds.map((id, deckOrder) => ({ id, deckOrder }))
}

function compareSessionDeckEntries<TEntry extends SessionDeckEntry>(
  left: { entry: TEntry; id: string; index: number },
  right: { entry: TEntry; id: string; index: number },
): number {
  const leftDeckOrder = finiteNumber(left.entry.deckOrder)
  const rightDeckOrder = finiteNumber(right.entry.deckOrder)
  if (leftDeckOrder !== undefined || rightDeckOrder !== undefined) {
    return (leftDeckOrder ?? Number.MAX_SAFE_INTEGER) - (rightDeckOrder ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
  }
  const leftCreatedAt = finiteNumber(left.entry.createdAt)
  const rightCreatedAt = finiteNumber(right.entry.createdAt)
  if (leftCreatedAt !== undefined || rightCreatedAt !== undefined) {
    return (leftCreatedAt ?? Number.MAX_SAFE_INTEGER) - (rightCreatedAt ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
  }
  return left.index - right.index || left.id.localeCompare(right.id)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
