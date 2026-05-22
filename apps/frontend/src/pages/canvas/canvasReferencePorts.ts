import type { Canvas, CanvasNodeData, CanvasParamType, CanvasPortDef } from '@/types'

function parseCanvasNodeData(raw?: string): CanvasNodeData {
  if (!raw) return { source: 'manual' }
  try {
    return JSON.parse(raw) as CanvasNodeData
  } catch {
    return { source: 'manual' }
  }
}

function normalizePortType(type?: CanvasParamType): CanvasPortDef['type'] {
  return type ?? 'resource'
}

export function deriveCanvasReferencePorts(canvas: Canvas): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  const inputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'input')
  const outputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'output')

  return {
    inputs: inputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType ?? 'text'),
        required: true,
      }
    }),
    outputs: outputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType),
      }
    }),
  }
}
