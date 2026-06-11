export const FINAL_OUTPUT_NODE_ID = 'final-output'

export interface CoreCanvasWorkflowNodeLike {
  id: string
  type?: string
  position?: {
    x: number
    y: number
  } | null
  data?: Record<string, unknown> | null
}

export function isFinalOutputNode(node: CoreCanvasWorkflowNodeLike) {
  return node.id === FINAL_OUTPUT_NODE_ID || Boolean(node.data?.lockedFinalOutput)
}

export function ensureFinalOutputNode<TNode extends CoreCanvasWorkflowNodeLike>(
  nodes: TNode[],
  createFinalOutputNode: () => TNode,
): TNode[] {
  if (nodes.some(isFinalOutputNode) || nodes.some((node) => node.type === 'output')) return nodes
  return [...nodes, createFinalOutputNode()]
}

export function workflowIoOrder(node: CoreCanvasWorkflowNodeLike, fallback = 0) {
  const order = node.data?.paramOrder
  return Number.isInteger(order) && Number(order) > 0 ? Number(order) : fallback
}

export function compareWorkflowIoNodes<TNode extends CoreCanvasWorkflowNodeLike>(a: TNode, b: TNode) {
  const aOrder = workflowIoOrder(a, Number.MAX_SAFE_INTEGER)
  const bOrder = workflowIoOrder(b, Number.MAX_SAFE_INTEGER)
  if (aOrder !== bOrder) return aOrder - bOrder
  const aPosition = a.position ?? { x: 0, y: 0 }
  const bPosition = b.position ?? { x: 0, y: 0 }
  if (aPosition.y !== bPosition.y) return aPosition.y - bPosition.y
  if (aPosition.x !== bPosition.x) return aPosition.x - bPosition.x
  return a.id.localeCompare(b.id)
}

export function normalizeWorkflowIoNodeOrders<TNode extends CoreCanvasWorkflowNodeLike>(nodes: TNode[]): TNode[] {
  const nextOrderByNodeId = new Map<string, number>()
  for (const type of ['input', 'output']) {
    let nextOrder = 1
    const usedOrders = new Set<number>()
    const sorted = nodes
      .filter((node) => node.type === type)
      .sort(compareWorkflowIoNodes)
    sorted.forEach((node) => {
      const order = node.data?.paramOrder
      if (Number.isInteger(order) && Number(order) > 0) {
        usedOrders.add(Number(order))
      }
    })
    sorted.forEach((node) => {
      const order = node.data?.paramOrder
      const hasOrder = Number.isInteger(order) && Number(order) > 0
      const nextOrderValue = hasOrder ? Number(order) : (() => {
        while (usedOrders.has(nextOrder)) nextOrder += 1
        const assigned = nextOrder
        usedOrders.add(assigned)
        nextOrder += 1
        return assigned
      })()
      nextOrderByNodeId.set(node.id, nextOrderValue)
    })
  }
  if (nextOrderByNodeId.size === 0) return nodes
  return nodes.map((node) => {
    const order = nextOrderByNodeId.get(node.id)
    if (!order) return node
    if (node.data?.paramOrder === order) return node
    return {
      ...node,
      data: {
        ...(node.data ?? {}),
        paramOrder: order,
      },
    }
  }) as TNode[]
}

export function nodeAcceptsTextResult(
  node: Pick<CoreCanvasWorkflowNodeLike, 'type'>,
  data: { outputType?: unknown } | null | undefined,
) {
  return node.type === 'text'
    || node.type === 'text_gen'
    || (node.type === 'ai_gen' && (data?.outputType ?? 'image') === 'text')
}
