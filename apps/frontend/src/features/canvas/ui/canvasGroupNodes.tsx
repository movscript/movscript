import { NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { CanvasGroupFrame, CanvasGroupHeader } from './CanvasEditorFlowUi'
import type { NodeDataWithHandlers } from './canvasNodeTypes'

export function GroupNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  return (
    <CanvasGroupFrame selected={selected}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
      />
      <CanvasGroupHeader>{data.groupLabel || data.label || t('canvas.nodeLabels.group')}</CanvasGroupHeader>
    </CanvasGroupFrame>
  )
}
