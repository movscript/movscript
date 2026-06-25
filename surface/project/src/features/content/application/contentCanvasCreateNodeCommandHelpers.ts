import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasCreateNodeInput } from './contentCanvasCreateNodeCommands'

export type ContentCanvasCreateNodeOptions = {
  input?: ContentCanvasCreateNodeInput
  position?: { x: number; y: number }
}

export function createdNodeResult(
  createdId: string,
  message: string,
  position?: { x: number; y: number },
  parentNodeId?: string,
): ContentCanvasCommandResult {
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: parentNodeId ? [parentNodeId, createdId] : [createdId],
    focusNodeId: createdId,
    nodePositions: position ? { [createdId]: position } : undefined,
    message,
  }
}

export function assertNodeKind(node: ContentCanvasNode, kind: ContentCanvasNode['kind'], label: string): void {
  if (node.kind !== kind) {
    throw new Error(`当前操作只支持${label}节点`)
  }
}

export function requiredProductionId(node: ContentCanvasNode): string {
  const id = idValue(node.record.production_id)
    ?? pathSegmentAfter(node.sourcePath, 'productions')
  if (!id) throw new Error('当前节点缺少 production 归属，无法创建子节点')
  return id
}

export function requiredSceneMomentRefs(node: ContentCanvasNode): { productionId: string; segmentId: string } {
  const productionId = requiredProductionId(node)
  const segmentId = idValue(node.record.segment_id)
    ?? pathSegmentAfter(node.sourcePath, 'segments')
  if (!segmentId) throw new Error('当前情节缺少 segment 归属，无法创建子节点')
  return { productionId, segmentId }
}

export function timestampId(prefix: string): string {
  return `${prefix}_${Date.now()}`
}

export function safeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'item'
}

export function createInputOrDefault(
  input: ContentCanvasCreateNodeInput | undefined,
  prefix: string,
  fallbackTitle: string,
): ContentCanvasCreateNodeInput {
  const id = input?.id.trim() || timestampId(prefix)
  const title = input?.title.trim() || fallbackTitle
  return { ...input, id, title }
}

export function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}
