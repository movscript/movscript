import {
  buildSessionDeckIndex,
  reorderSessionDeckEntries,
} from '@movscript/core/agent'

import {
  projectEntryDefinitions,
  type ProjectEntryDefinition,
  type ProjectEntryId,
} from '../domain/projectEntryRegistry'
import {
  contentCanvasIdFromProjectEntrySessionId,
  isContentCanvasProjectEntrySessionId,
  projectEntrySessionBaseId,
  projectEntrySessionKey,
  type ProjectEntrySessionId,
  type ProjectEntrySessionSnapshot,
} from '../application/projectEntrySessionStore'

export interface ProjectEntryDeckTab {
  id: ProjectEntrySessionId
  active: boolean
  definition: ProjectEntryDefinition
  deckOrder?: number
  restoredRoute?: string
  restoredSearch?: string
  snapshot?: ProjectEntrySessionSnapshot
  title: string
  shortTitle: string
}

export interface ProjectEntryDeck {
  tabs: ProjectEntryDeckTab[]
  hiddenEntryIds: Set<ProjectEntrySessionId>
  orderIndex: Map<ProjectEntrySessionId, number>
}

export function buildProjectEntryDeck(input: {
  activeEntryId?: ProjectEntrySessionId
  definitions?: ProjectEntryDefinition[]
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}): ProjectEntryDeck {
  const definitions = input.definitions ?? projectEntryDefinitions
  const entries = definitions.flatMap((definition, index) => projectEntryDeckEntries({
    activeEntryId: input.activeEntryId,
    definition,
    index,
    projectId: input.projectId,
    snapshots: input.snapshots,
  }))
  const deck = buildSessionDeckIndex({ entries })
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))

  return {
    tabs: [...deck.openIds].flatMap((id) => {
      const entryId = id as ProjectEntrySessionId
      const definition = definitionsById.get(projectEntrySessionBaseId(entryId) as ProjectEntryId)
      const entry = entryById.get(entryId)
      return definition && entry ? [projectEntryDeckTab({ definition, entry, activeEntryId: input.activeEntryId })] : []
    }),
    hiddenEntryIds: new Set([...deck.closedIds].map((id) => id as ProjectEntrySessionId)),
    orderIndex: new Map([...deck.orderIndex].map(([id, index]) => [id as ProjectEntrySessionId, index])),
  }
}

export function buildProjectEntryDeckOrderUpdates(input: {
  definitions?: ProjectEntryDefinition[]
  draggedEntryId: ProjectEntrySessionId
  position: 'before' | 'after'
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
  targetEntryId: ProjectEntrySessionId
}): Array<{ projectEntryId: ProjectEntrySessionId; deckOrder: number }> {
  const definitions = input.definitions ?? projectEntryDefinitions
  const entries = definitions.flatMap((definition, index) => projectEntryDeckEntries({
    definition,
    index,
    projectId: input.projectId,
    snapshots: input.snapshots,
  }))
  return reorderSessionDeckEntries({
    entries,
    draggedId: input.draggedEntryId,
    targetId: input.targetEntryId,
    position: input.position,
  }).map((order) => ({
    projectEntryId: order.id as ProjectEntrySessionId,
    deckOrder: order.deckOrder,
  }))
}

function projectEntryDeckEntries(input: {
  activeEntryId?: ProjectEntrySessionId
  definition: ProjectEntryDefinition
  index: number
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}) {
  if (input.definition.id !== 'content_canvas') return [projectEntryDeckEntry({
    ...input,
    id: input.definition.id,
    createdAt: input.index,
  })]

  const instanceIds = contentCanvasProjectEntryInstanceIds({
    activeEntryId: input.activeEntryId,
    projectId: input.projectId,
    snapshots: input.snapshots,
  })
  const baseSnapshot = projectEntryDeckSnapshotFor({
    projectEntryId: 'content_canvas',
    projectId: input.projectId,
    snapshots: input.snapshots,
  })
  const includeBaseEntry = instanceIds.length === 0
    || input.activeEntryId === 'content_canvas'
    || Boolean(baseSnapshot)
  const entries = [
    ...(includeBaseEntry ? [projectEntryDeckEntry({
      ...input,
      id: 'content_canvas',
      createdAt: input.index,
    })] : []),
    ...instanceIds.map((id, offset) => projectEntryDeckEntry({
      ...input,
      id,
      createdAt: input.index + offset + 1,
    })),
  ]
  return entries
}

function projectEntryDeckEntry(input: {
  activeEntryId?: ProjectEntrySessionId
  createdAt: number
  definition: ProjectEntryDefinition
  id: ProjectEntrySessionId
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}) {
  const snapshot = projectEntryDeckSnapshotFor({
    projectEntryId: input.id,
    projectId: input.projectId,
    snapshots: input.snapshots,
  })
  const active = input.activeEntryId === input.id
  const requiresFocusedSession = input.definition.id === 'content_preview' || input.definition.id === 'setting_preview'
  return {
    id: input.id,
    open: active ? true : snapshot ? snapshot.open : requiresFocusedSession ? false : undefined,
    archived: false,
    createdAt: input.createdAt,
    updatedAt: projectEntrySnapshotUpdatedAt(snapshot),
    deckOrder: snapshot?.deckOrder,
    snapshot,
  }
}

function projectEntryDeckTab(input: {
  activeEntryId?: ProjectEntrySessionId
  definition: ProjectEntryDefinition
  entry: ReturnType<typeof projectEntryDeckEntry>
}): ProjectEntryDeckTab {
  const { definition, entry } = input
  const instanceTitle = contentCanvasProjectEntryTitle(entry.snapshot, entry.id)
  return {
    id: entry.id,
    active: input.activeEntryId === entry.id,
    definition,
    title: instanceTitle ?? definition.title,
    shortTitle: instanceTitle ?? definition.shortTitle,
    ...(entry.deckOrder !== undefined ? { deckOrder: entry.deckOrder } : {}),
    ...(entry.snapshot ? { snapshot: entry.snapshot } : {}),
    ...(entry.snapshot?.route ? { restoredRoute: entry.snapshot.route } : {}),
    ...(entry.snapshot?.search ? { restoredSearch: entry.snapshot.search } : {}),
  }
}

function projectEntrySnapshotUpdatedAt(snapshot: ProjectEntrySessionSnapshot | undefined): number | undefined {
  if (!snapshot?.updatedAt) return undefined
  const value = Date.parse(snapshot.updatedAt)
  return Number.isFinite(value) ? value : undefined
}

function projectEntryDeckSnapshotFor(input: {
  projectEntryId: ProjectEntrySessionId
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}): ProjectEntrySessionSnapshot | undefined {
  return input.snapshots[projectEntrySessionKey(input.projectId, input.projectEntryId)]
    ?? (input.projectEntryId === 'orchestration_production'
      ? input.snapshots[projectEntrySessionKey(input.projectId, 'scripts')]
      : input.projectEntryId === 'content_preview'
        ? input.snapshots[projectEntrySessionKey(input.projectId, 'content')]
      : undefined)
}

function contentCanvasProjectEntryInstanceIds(input: {
  activeEntryId?: ProjectEntrySessionId
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}): ProjectEntrySessionId[] {
  const projectId = Number(input.projectId) || 0
  const ids = new Set<ProjectEntrySessionId>()
  if (isContentCanvasProjectEntrySessionId(input.activeEntryId)) ids.add(input.activeEntryId)
  for (const snapshot of Object.values(input.snapshots)) {
    if (snapshot.projectId !== projectId) continue
    if (isContentCanvasProjectEntrySessionId(snapshot.projectEntryId)) ids.add(snapshot.projectEntryId)
  }
  return [...ids].sort((left, right) => (
    (projectEntrySnapshotUpdatedAt(input.snapshots[projectEntrySessionKey(projectId, right)]) ?? 0)
    - (projectEntrySnapshotUpdatedAt(input.snapshots[projectEntrySessionKey(projectId, left)]) ?? 0)
    || left.localeCompare(right)
  ))
}

function contentCanvasProjectEntryTitle(
  snapshot: ProjectEntrySessionSnapshot | undefined,
  id: ProjectEntrySessionId,
): string | undefined {
  const title = snapshot?.filters?.canvasTitle
  if (typeof title === 'string' && title.trim()) return title.trim()
  const canvasId = contentCanvasIdFromProjectEntrySessionId(id)
  return canvasId ? `画布 ${canvasId.replace(/^canvas:/, '')}` : undefined
}
