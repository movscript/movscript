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
      paramType: 'resource',
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

export function nodeAcceptsTextResult(node: Node, data: Partial<CanvasNodeData>) {
  return node.type === 'text'
    || node.type === 'text_gen'
    || (node.type === 'ai_gen' && (data.outputType ?? 'image') === 'text')
}
