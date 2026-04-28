import type { PipelineNode } from '@/types'
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

export function workbenchEntityPath(kind: EntityKind, id: number, nodeId?: number) {
  const params = new URLSearchParams({
    kind,
    id: String(id),
  })
  if (nodeId) params.set('node', String(nodeId))
  return `/creation?${params.toString()}`
}

export function workbenchPathForPipelineNode(node: PipelineNode) {
  if (isWorkbenchEntityKind(node.entity_type) && node.entity_id) {
    return workbenchEntityPath(node.entity_type, node.entity_id, node.ID)
  }

  const params = new URLSearchParams({ node: String(node.ID) })
  return `/creation?${params.toString()}`
}
