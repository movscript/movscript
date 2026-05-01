import type { EntityKind } from './config'

const WORKBENCH_ENTITY_KINDS: EntityKind[] = [
  'script',
  'setting',
  'asset',
  'episode',
  'scene',
  'storyboard',
  'shot',
  'final_video',
]

export function isWorkbenchEntityKind(value?: string | null): value is EntityKind {
  return !!value && WORKBENCH_ENTITY_KINDS.includes(value as EntityKind)
}

export function workbenchEntityPath(kind: EntityKind, id: number) {
  const params = new URLSearchParams({
    kind,
    id: String(id),
  })
  return `/creation?${params.toString()}`
}
