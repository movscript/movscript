import type { ContentCanvasDocumentNodeInput } from './contentCanvasDocuments'
import type { ContentCanvasNode, ContentCanvasNodeKind, ContentCanvasWorkspaceSnapshot } from '../domain/contentCanvasTypes'

export interface ContentCanvasDocumentNodeInputsWithReferencesInput {
  nodeId: string
  graph: ContentCanvasWorkspaceSnapshot
  position?: { x: number; y: number }
  existingNodeIds?: Iterable<string>
}

const AUTO_REFERENCE_NODE_LIMIT = 48
const PROMPT_REFERENCE_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*:+\s*([^}\s]+)\s*\}\}/g

export function contentCanvasDocumentNodeInputsWithReferences({
  existingNodeIds,
  graph,
  nodeId,
  position,
}: ContentCanvasDocumentNodeInputsWithReferencesInput): ContentCanvasDocumentNodeInput[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const node = nodeById.get(nodeId)
  const existing = new Set(existingNodeIds ?? [])
  const inputs: ContentCanvasDocumentNodeInput[] = [{
    nodeId,
    kind: node?.kind,
    position,
  }]
  if (!node) return inputs

  const referenceNodes = collectContentCanvasReferenceNodes({
    graph,
    node,
    nodeById,
  }).filter((referenceNode) => referenceNode.id !== node.id && !existing.has(referenceNode.id))

  const referenceCount = referenceNodes.length
  referenceNodes.forEach((referenceNode, index) => {
    inputs.push({
      nodeId: referenceNode.id,
      kind: referenceNode.kind,
      position: position ? contentCanvasReferenceNodePosition(position, index, referenceCount) : undefined,
    })
  })
  return inputs
}

export function collectContentCanvasReferenceNodes({
  graph,
  node,
  nodeById = new Map(graph.nodes.map((item) => [item.id, item])),
}: {
  graph: ContentCanvasWorkspaceSnapshot
  node: ContentCanvasNode
  nodeById?: Map<string, ContentCanvasNode>
}): ContentCanvasNode[] {
  const output: ContentCanvasNode[] = []
  const outputIds = new Set<string>()
  const visitedSubjectIds = new Set<string>()
  const nodeByKindAndKey = contentCanvasNodeByPromptRefKey(graph.nodes)
  const queue: ContentCanvasNode[] = [node]

  while (queue.length && output.length < AUTO_REFERENCE_NODE_LIMIT) {
    const subject = queue.shift()
    if (!subject || visitedSubjectIds.has(subject.id)) continue
    visitedSubjectIds.add(subject.id)
    for (const referenceNode of collectDirectContentCanvasReferenceNodes({
      graph,
      node: subject,
      nodeById,
      nodeByKindAndKey,
    })) {
      if (referenceNode.id === node.id || outputIds.has(referenceNode.id)) continue
      if (!contentCanvasNodeCanAutoJoinFreeCanvas(referenceNode)) continue
      outputIds.add(referenceNode.id)
      output.push(referenceNode)
      queue.push(referenceNode)
      if (output.length >= AUTO_REFERENCE_NODE_LIMIT) break
    }
  }

  return output
}

function collectDirectContentCanvasReferenceNodes({
  graph,
  node,
  nodeById,
  nodeByKindAndKey,
}: {
  graph: ContentCanvasWorkspaceSnapshot
  node: ContentCanvasNode
  nodeById: Map<string, ContentCanvasNode>
  nodeByKindAndKey: Map<string, ContentCanvasNode>
}): ContentCanvasNode[] {
  const subjectIds = new Set([node.id, node.generationTask?.nodeId].filter((value): value is string => Boolean(value)))
  const references: ContentCanvasNode[] = []

  for (const edge of graph.edges) {
    if (edge.kind !== 'reference') continue
    if (subjectIds.has(edge.source)) {
      const target = nodeById.get(edge.target)
      if (target) references.push(target)
    }
    if (subjectIds.has(edge.target)) {
      const source = nodeById.get(edge.source)
      if (source) references.push(source)
    }
  }

  for (const token of promptReferenceTokensForNode(node)) {
    const referenceNode = nodeByKindAndKey.get(`${token.kind}:${token.key}`)
    if (referenceNode) references.push(referenceNode)
  }

  return uniqueContentCanvasNodes(references)
}

function promptReferenceTokensForNode(node: ContentCanvasNode): Array<{ kind: ContentCanvasNodeKind; key: string }> {
  const prompt = contentCanvasPromptText(node)
  if (!prompt) return []
  const tokens: Array<{ kind: ContentCanvasNodeKind; key: string }> = []
  for (const match of prompt.matchAll(PROMPT_REFERENCE_PATTERN)) {
    const kind = contentCanvasPromptReferenceKind(match[1])
    const key = match[2]?.trim()
    if (kind && key) tokens.push({ kind, key })
  }
  return tokens
}

function contentCanvasNodeByPromptRefKey(nodes: ContentCanvasNode[]): Map<string, ContentCanvasNode> {
  const map = new Map<string, ContentCanvasNode>()
  for (const node of nodes) {
    for (const key of uniqueStrings(node.entityKey, node.id, contentCanvasNodeIdSuffix(node.id), node.sourcePath)) {
      map.set(`${node.kind}:${key}`, node)
    }
  }
  return map
}

function contentCanvasPromptText(node: ContentCanvasNode): string {
  if (node.generationTask?.prompt) return node.generationTask.prompt
  const editPrompt = node.record.edit_prompt ?? node.record.editPrompt
  if (typeof editPrompt === 'string') return editPrompt
  if (isRecord(editPrompt) && typeof editPrompt.text === 'string') return editPrompt.text
  for (const value of [node.record.prompt, node.record.prompt_text, node.record.generation_prompt, node.summary]) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function contentCanvasPromptReferenceKind(kind: string | undefined): ContentCanvasNodeKind | null {
  const normalized = kind?.trim().toLowerCase()
  if (normalized === 'asset'
    || normalized === 'resource'
    || normalized === 'keyframe'
    || normalized === 'storyboard'
    || normalized === 'scene_moment'
    || normalized === 'expression_unit'
    || normalized === 'content_unit') return normalized
  return null
}

function contentCanvasNodeCanAutoJoinFreeCanvas(node: ContentCanvasNode): boolean {
  if (node.kind === 'content_unit') return contentCanvasNodeIsNakedGenerationTask(node)
  return node.kind !== 'production'
    && node.kind !== 'segment'
    && node.kind !== 'setting'
    && node.kind !== 'state'
    && node.kind !== 'selection'
    && node.kind !== 'candidate'
    && node.kind !== 'actor'
    && node.kind !== 'work_item'
    && node.kind !== 'group'
}

function contentCanvasNodeIsNakedGenerationTask(node: ContentCanvasNode): boolean {
  const modelIntent = node.record.model_intent
  return Boolean(modelIntent
    && typeof modelIntent === 'object'
    && !Array.isArray(modelIntent)
    && (modelIntent as Record<string, unknown>).source === 'content_canvas_naked_task')
}

function contentCanvasReferenceNodePosition(
  anchor: { x: number; y: number },
  index: number,
  count: number,
): { x: number; y: number } {
  const column = Math.floor(index / 4)
  const row = index % 4
  const rows = Math.min(count - column * 4, 4)
  return {
    x: anchor.x - 390 - column * 280,
    y: anchor.y + Math.round((row - (rows - 1) / 2) * 172),
  }
}

function contentCanvasNodeIdSuffix(nodeId: string): string {
  const index = nodeId.indexOf(':')
  return index >= 0 ? nodeId.slice(index + 1) : nodeId
}

function uniqueContentCanvasNodes(nodes: ContentCanvasNode[]): ContentCanvasNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()]
}

function uniqueStrings(...values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
