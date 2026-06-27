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
  projectEntrySessionKey,
  type ProjectEntrySessionSnapshot,
} from '../application/projectEntrySessionStore'

export interface ProjectEntryDeckTab {
  id: ProjectEntryId
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
  hiddenEntryIds: Set<ProjectEntryId>
  orderIndex: Map<ProjectEntryId, number>
}

export function buildProjectEntryDeck(input: {
  activeEntryId?: ProjectEntryId
  definitions?: ProjectEntryDefinition[]
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}): ProjectEntryDeck {
  const definitions = input.definitions ?? projectEntryDefinitions
  const entries = definitions.map((definition, index) => projectEntryDeckEntry({
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
      const definition = definitionsById.get(id as ProjectEntryId)
      const entry = entryById.get(id as ProjectEntryId)
      return definition && entry ? [projectEntryDeckTab({ definition, entry, activeEntryId: input.activeEntryId })] : []
    }),
    hiddenEntryIds: new Set([...deck.closedIds].map((id) => id as ProjectEntryId)),
    orderIndex: new Map([...deck.orderIndex].map(([id, index]) => [id as ProjectEntryId, index])),
  }
}

export function buildProjectEntryDeckOrderUpdates(input: {
  definitions?: ProjectEntryDefinition[]
  draggedEntryId: ProjectEntryId
  position: 'before' | 'after'
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
  targetEntryId: ProjectEntryId
}): Array<{ projectEntryId: ProjectEntryId; deckOrder: number }> {
  const definitions = input.definitions ?? projectEntryDefinitions
  const entries = definitions.map((definition, index) => projectEntryDeckEntry({
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
    projectEntryId: order.id as ProjectEntryId,
    deckOrder: order.deckOrder,
  }))
}

function projectEntryDeckEntry(input: {
  activeEntryId?: ProjectEntryId
  definition: ProjectEntryDefinition
  index: number
  projectId: number | null | undefined
  snapshots: Record<string, ProjectEntrySessionSnapshot>
}) {
  const snapshot = projectEntryDeckSnapshotFor({
    projectEntryId: input.definition.id,
    projectId: input.projectId,
    snapshots: input.snapshots,
  })
  const active = input.activeEntryId === input.definition.id
  const requiresFocusedSession = input.definition.id === 'content_preview' || input.definition.id === 'setting_preview'
  return {
    id: input.definition.id,
    open: active ? true : snapshot ? snapshot.open : requiresFocusedSession ? false : undefined,
    archived: false,
    createdAt: input.index,
    updatedAt: projectEntrySnapshotUpdatedAt(snapshot),
    deckOrder: snapshot?.deckOrder,
    snapshot,
  }
}

function projectEntryDeckTab(input: {
  activeEntryId?: ProjectEntryId
  definition: ProjectEntryDefinition
  entry: ReturnType<typeof projectEntryDeckEntry>
}): ProjectEntryDeckTab {
  const { definition, entry } = input
  return {
    id: definition.id,
    active: input.activeEntryId === definition.id,
    definition,
    title: definition.title,
    shortTitle: definition.shortTitle,
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
  projectEntryId: ProjectEntryId
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
