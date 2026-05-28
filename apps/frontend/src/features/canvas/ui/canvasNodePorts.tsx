import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { CanvasNodeData, CanvasPortDef } from '@/types'
import {
  CanvasNodeFrame,
  CanvasNodeSemanticPortRows,
  canvasNodeCardPortHandleStyle,
  canvasNodeSemanticSourceHandleStyle,
  canvasNodeSemanticTargetHandleStyle,
  type CanvasPortHandleRenderer,
} from '@movscript/ui'
import {
  canvasNodeSemanticPort,
  resolvePorts,
  toolInputSlots,
  toolOutputSlots,
} from './canvasNodeUiAdapters'

const semanticInputHandleId = (portId: string) => `in:${portId}`
const semanticOutputHandleId = (portId: string) => `out:${portId}`

export function SemanticPortRows({
  nodeType,
  inputPorts,
  outputPorts,
  inputs = true,
  outputs = true,
}: {
  nodeType: string
  inputPorts?: CanvasNodeData['inputPorts']
  outputPorts?: CanvasNodeData['outputPorts']
  inputs?: boolean
  outputs?: boolean
}) {
  const { t } = useTranslation()
  const { resolvedInputs, resolvedOutputs } = resolvePorts({ nodeType, inputPorts, outputPorts, inputs, outputs })
  if (resolvedInputs.length === 0 && resolvedOutputs.length === 0) return null

  return (
    <CanvasNodeSemanticPortRows
      inputPorts={resolvedInputs.map((port) => canvasNodeSemanticPort(port, t))}
      outputPorts={resolvedOutputs.map((port) => canvasNodeSemanticPort(port, t))}
      srLabel={t('canvas.ports.semanticRows', { defaultValue: 'Semantic input and output ports' })}
      requiredLabel={t('canvas.ports.required', { defaultValue: 'Required' })}
      renderPortHandle={renderCanvasSemanticPortHandle}
    />
  )
}

const renderCanvasSemanticPortHandle: CanvasPortHandleRenderer = ({ id, type, side, label }) => (
  <Handle
    id={type === 'target' ? semanticInputHandleId(id) : semanticOutputHandleId(id)}
    type={type}
    position={side === 'left' ? Position.Left : Position.Right}
    title={label}
    style={type === 'target' ? canvasNodeSemanticTargetHandleStyle : canvasNodeSemanticSourceHandleStyle}
  />
)

export function CanvasCardPortHandle({
  id,
  type,
  side,
  label,
}: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) {
  return (
    <Handle
      id={type === 'target' ? semanticInputHandleId(id) : semanticOutputHandleId(id)}
      type={type}
      position={side === 'left' ? Position.Left : Position.Right}
      title={label}
      style={canvasNodeCardPortHandleStyle}
    />
  )
}

export function ToolCardNodeFrame({
  nodeType,
  data,
  children,
}: {
  nodeType: string
  data: CanvasNodeData
  children: ReactNode
}) {
  const { resolvedInputs, resolvedOutputs } = resolvePorts({
    nodeType,
    inputPorts: data.inputPorts,
    outputPorts: data.outputPorts,
  })
  const visibleInputIds = toolInputSlots(nodeType, data, (key: string) => key).slice(0, 3).map((slot) => slot.inputPortId ?? slot.id)
  const visibleOutputIds = toolOutputSlots(nodeType, data, (key: string) => key).slice(0, 2).map((slot) => slot.outputPortId ?? slot.id)
  return (
    <CanvasNodePortFrame
      inputs={resolvedInputs}
      outputs={resolvedOutputs}
      visibleInputIds={visibleInputIds}
      visibleOutputIds={visibleOutputIds}
    >
      {children}
    </CanvasNodePortFrame>
  )
}

export function CanvasNodePortFrame({
  inputs = [],
  outputs = [],
  visibleInputIds = [],
  visibleOutputIds = [],
  children,
}: {
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  visibleInputIds?: string[]
  visibleOutputIds?: string[]
  children: ReactNode
}) {
  return (
    <CanvasNodeFrame>
      <HiddenPortHandles
        inputs={inputs}
        outputs={outputs}
        visibleInputIds={visibleInputIds}
        visibleOutputIds={visibleOutputIds}
      />
      {children}
    </CanvasNodeFrame>
  )
}

function HiddenPortHandles({
  inputs = [],
  outputs = [],
  visibleInputIds = [],
  visibleOutputIds = [],
}: {
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  visibleInputIds?: string[]
  visibleOutputIds?: string[]
}) {
  const visibleInputSet = new Set(visibleInputIds)
  const visibleOutputSet = new Set(visibleOutputIds)
  const hiddenInputs = inputs.filter((port) => !visibleInputSet.has(port.id))
  const hiddenOutputs = outputs.filter((port) => !visibleOutputSet.has(port.id))
  return (
    <>
      {hiddenInputs.map((port, index) => (
        <Handle
          key={`hidden-in-${port.id}`}
          id={semanticInputHandleId(port.id)}
          type="target"
          position={Position.Left}
          title={port.label ?? port.id}
          style={{
            ...canvasNodeSemanticTargetHandleStyle,
            top: `${Math.min(88, 18 + index * 14)}%`,
            opacity: 0,
          }}
        />
      ))}
      {hiddenOutputs.map((port, index) => (
        <Handle
          key={`hidden-out-${port.id}`}
          id={semanticOutputHandleId(port.id)}
          type="source"
          position={Position.Right}
          title={port.label ?? port.id}
          style={{
            ...canvasNodeSemanticSourceHandleStyle,
            top: `${Math.min(88, 18 + index * 14)}%`,
            opacity: 0,
          }}
        />
      ))}
    </>
  )
}
