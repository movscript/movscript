import type { Node } from '@xyflow/react'
import type { CanvasNodeData, NodeType } from '@movscript/shared'
import { CANVAS_NODE_DEFINITION_MAP, CANVAS_NODE_LABELS } from './nodeDefinitions'
import { normalizedCanvasNodeStyle } from './layout'
import {
  FINAL_OUTPUT_NODE_ID,
  compareWorkflowIoNodes,
  ensureFinalOutputNode as ensureCoreFinalOutputNode,
  isFinalOutputNode,
  nodeAcceptsTextResult,
  normalizeWorkflowIoNodeOrders,
  workflowIoOrder,
} from '@movscript/core/canvas'

export {
  FINAL_OUTPUT_NODE_ID,
  compareWorkflowIoNodes,
  isFinalOutputNode,
  nodeAcceptsTextResult,
  normalizeWorkflowIoNodeOrders,
  workflowIoOrder,
} from '@movscript/core/canvas'

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

export function ensureFinalOutputNode(nodes: Node[], t: (key: string, options?: any) => string) {
  return ensureCoreFinalOutputNode(nodes, () => createFinalOutputNode(t))
}
