import type { Node } from '@xyflow/react'
import type { CanvasNodeData, NodeType } from '@/types'
import { CANVAS_NODE_DEFINITION_MAP, CANVAS_NODE_LABELS } from './nodeDefinitions'
import { FINAL_OUTPUT_NODE_ID, normalizedCanvasNodeStyle } from './layout'

export function createCanvasNodeData(
  type: NodeType,
  t: (key: string, options?: any) => string,
): Partial<CanvasNodeData> & { label: string } {
  const meta = CANVAS_NODE_DEFINITION_MAP[type]
  const data = { ...(meta?.defaultData ?? { source: 'upload', label: CANVAS_NODE_LABELS[type] }) }
  return { ...data, label: meta ? t(meta.defaultLabelKey) : t(`canvas.nodeLabels.${type}`) }
}

export function createFinalOutputNode(t: (key: string, options?: any) => string): Node {
  return {
    id: FINAL_OUTPUT_NODE_ID,
    type: 'output',
    position: { x: 560, y: 120 },
    data: {
      ...createCanvasNodeData('output', t),
      label: t('canvas.editor.finalOutput', { defaultValue: '最终输出' }),
      paramName: 'final_output',
      paramType: 'image',
      lockedFinalOutput: true,
    } as any,
    style: normalizedCanvasNodeStyle('output'),
  }
}

export function isFinalOutputNode(node: Node) {
  return node.id === FINAL_OUTPUT_NODE_ID || Boolean((node.data as any)?.lockedFinalOutput)
}

export function ensureFinalOutputNode(nodes: Node[], t: (key: string, options?: any) => string) {
  if (nodes.some(isFinalOutputNode) || nodes.some((node) => node.type === 'output')) return nodes
  return [...nodes, createFinalOutputNode(t)]
}

export function workflowIoOrder(node: Node, fallback = 0) {
  const data = node.data as Partial<CanvasNodeData>
  return Number.isInteger(data.paramOrder) && Number(data.paramOrder) > 0
    ? Number(data.paramOrder)
    : fallback
}

export function compareWorkflowIoNodes(a: Node, b: Node) {
  const aOrder = workflowIoOrder(a, Number.MAX_SAFE_INTEGER)
  const bOrder = workflowIoOrder(b, Number.MAX_SAFE_INTEGER)
  if (aOrder !== bOrder) return aOrder - bOrder
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  if (a.position.x !== b.position.x) return a.position.x - b.position.x
  return a.id.localeCompare(b.id)
}

export function normalizeWorkflowIoNodeOrders(nodes: Node[]) {
  const nextOrderByNodeId = new Map<string, number>()
  for (const type of ['input', 'output']) {
    let nextOrder = 1
    const usedOrders = new Set<number>()
    const sorted = nodes
      .filter((node) => node.type === type)
      .sort(compareWorkflowIoNodes)
    sorted.forEach((node) => {
      const data = node.data as Partial<CanvasNodeData>
      if (Number.isInteger(data.paramOrder) && Number(data.paramOrder) > 0) {
        usedOrders.add(Number(data.paramOrder))
      }
    })
    sorted.forEach((node) => {
      const data = node.data as Partial<CanvasNodeData>
      const hasOrder = Number.isInteger(data.paramOrder) && Number(data.paramOrder) > 0
      const order = hasOrder ? Number(data.paramOrder) : (() => {
        while (usedOrders.has(nextOrder)) nextOrder += 1
        const assigned = nextOrder
        usedOrders.add(assigned)
        nextOrder += 1
        return assigned
      })()
      nextOrderByNodeId.set(node.id, order)
    })
  }
  if (nextOrderByNodeId.size === 0) return nodes
  return nodes.map((node) => {
    const order = nextOrderByNodeId.get(node.id)
    if (!order) return node
    const data = node.data as Partial<CanvasNodeData>
    if (data.paramOrder === order) return node
    return {
      ...node,
      data: {
        ...data,
        paramOrder: order,
      },
    }
  })
}

export function nodeAcceptsTextResult(node: Node, data: Partial<CanvasNodeData>) {
  return node.type === 'text'
    || node.type === 'text_gen'
    || (node.type === 'ai_gen' && (data.outputType ?? 'image') === 'text')
}
