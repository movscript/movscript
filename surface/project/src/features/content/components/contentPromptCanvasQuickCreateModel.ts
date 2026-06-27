import type { ContentCanvasNode } from '../domain/contentCanvasTypes'

const SEGMENT_PRODUCTION_REFERENCE_FIELDS = [
  'production_id',
  'productionId',
  'production_ref',
  'productionRef',
  'production_key',
  'productionKey',
  'production_path',
  'productionPath',
  'production',
  'parent_id',
  'parentId',
  'parent_ref',
  'parentRef',
  'parent',
] as const

const OBJECT_REFERENCE_FIELDS = [
  'id',
  'key',
  'ref',
  'path',
  'sourcePath',
  'production_id',
  'productionId',
] as const

export function contentCanvasSegmentsForProduction(
  segments: ContentCanvasNode[],
  productionId: string,
  productions: ContentCanvasNode[] = [],
): ContentCanvasNode[] {
  if (!normalizeReferenceToken(productionId)) return segments
  const production = contentCanvasProductionForId(productions, productionId)
  return segments.filter((segment) => contentCanvasSegmentBelongsToProduction(segment, productionId, production))
}

export function contentCanvasFirstSegmentIdForProduction(
  segments: ContentCanvasNode[],
  productionId: string,
  productions: ContentCanvasNode[] = [],
): string {
  return contentCanvasSegmentsForProduction(segments, productionId, productions)[0]?.entityKey ?? ''
}

export function contentCanvasSegmentBelongsToProduction(
  segment: ContentCanvasNode,
  productionId: string,
  production?: ContentCanvasNode,
): boolean {
  return referenceTokenSetsIntersect(
    productionReferenceTokens(productionId, production),
    segmentProductionReferenceTokens(segment),
  )
}

export function contentCanvasNodeBelongsToProductionScope(
  node: ContentCanvasNode,
  productionId: string,
  productions: ContentCanvasNode[] = [],
): boolean {
  if (!normalizeReferenceToken(productionId)) return true
  const production = contentCanvasProductionForId(productions, productionId)
  if (node.kind === 'production') {
    return referenceTokenSetsIntersect(
      productionReferenceTokens(productionId, production),
      productionReferenceTokens(node.entityKey, node),
    )
  }
  if (node.kind === 'segment') {
    return contentCanvasSegmentBelongsToProduction(node, productionId, production)
  }
  return referenceTokenSetsIntersect(
    productionReferenceTokens(productionId, production),
    nodeProductionReferenceTokens(node),
  )
}

function contentCanvasProductionForId(
  productions: ContentCanvasNode[],
  productionId: string,
): ContentCanvasNode | undefined {
  const selectedTokens = referenceTokensForValue(productionId)
  return productions.find((production) => referenceTokenSetsIntersect(
    productionReferenceTokens(production.entityKey, production),
    selectedTokens,
  ))
}

function productionReferenceTokens(
  productionId: string,
  production?: ContentCanvasNode,
): Set<string> {
  const tokens = referenceTokensForValue(productionId)
  if (!production) return tokens
  addReferenceTokens(tokens, production.id)
  addReferenceTokens(tokens, production.entityKey)
  addReferenceTokens(tokens, production.sourcePath)
  addReferenceTokens(tokens, production.record.id)
  addReferenceTokens(tokens, production.record.key)
  return tokens
}

function segmentProductionReferenceTokens(segment: ContentCanvasNode): Set<string> {
  const tokens = new Set<string>()
  for (const field of SEGMENT_PRODUCTION_REFERENCE_FIELDS) {
    addReferenceTokens(tokens, segment.record[field])
  }
  addReferenceTokens(tokens, segment.sourcePath)
  addReferenceTokens(tokens, pathSegmentAfter(segment.sourcePath, 'productions'))
  return tokens
}

function nodeProductionReferenceTokens(node: ContentCanvasNode): Set<string> {
  const tokens = new Set<string>()
  addReferenceTokens(tokens, node.sourcePath)
  addReferenceTokens(tokens, pathSegmentAfter(node.sourcePath, 'productions'))
  for (const ancestorNodeId of node.domainAncestorNodeIds ?? []) {
    addReferenceTokens(tokens, ancestorNodeId)
  }
  for (const field of SEGMENT_PRODUCTION_REFERENCE_FIELDS) {
    addReferenceTokens(tokens, node.record[field])
  }
  return tokens
}

function referenceTokensForValue(value: unknown): Set<string> {
  const tokens = new Set<string>()
  addReferenceTokens(tokens, value)
  return tokens
}

function addReferenceTokens(tokens: Set<string>, value: unknown): void {
  for (const rawValue of primitiveReferenceValues(value)) {
    const text = normalizeReferenceToken(rawValue)
    if (!text) continue
    tokens.add(text)
    const prefixedId = text.includes(':') ? text.split(':').at(-1) : undefined
    if (prefixedId) tokens.add(prefixedId)
    const productionPathId = pathSegmentAfter(text, 'productions')
    if (productionPathId) tokens.add(productionPathId)
    const timelinePathId = pathSegmentAfter(text, 'timeline')
    if (timelinePathId) tokens.add(timelinePathId)
    const withoutJsonFile = text
      .replace(/\/production\.json$/u, '')
      .replace(/\/segment\.json$/u, '')
    if (withoutJsonFile !== text) {
      tokens.add(withoutJsonFile)
      const productionPathIdWithoutJson = pathSegmentAfter(withoutJsonFile, 'productions')
      if (productionPathIdWithoutJson) tokens.add(productionPathIdWithoutJson)
      const timelinePathIdWithoutJson = pathSegmentAfter(withoutJsonFile, 'timeline')
      if (timelinePathIdWithoutJson) tokens.add(timelinePathIdWithoutJson)
    }
  }
}

function primitiveReferenceValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(primitiveReferenceValues)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return OBJECT_REFERENCE_FIELDS.flatMap((field) => primitiveReferenceValues(record[field]))
}

function normalizeReferenceToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/^\/+|\/+$/gu, '')
}

function pathSegmentAfter(path: unknown, marker: string): string | undefined {
  const normalizedPath = normalizeReferenceToken(path)
  if (!normalizedPath) return undefined
  const parts = normalizedPath.split('/').filter(Boolean)
  const markerIndex = parts.indexOf(marker)
  return markerIndex >= 0 ? parts[markerIndex + 1] : undefined
}

function referenceTokenSetsIntersect(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}
