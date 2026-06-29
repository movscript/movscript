import type { CanvasNodeData, CanvasParamType, CanvasPortValue, RawResource } from '@movscript/shared'

export type NodeDataWithHandlers = CanvasNodeData & {
  label: string
  availableResources?: RawResource[]
  referenceResources?: RawResource[]
  runtimeInputValues?: Record<string, CanvasPortValue[]>
  canvasDebug?: {
    media?: boolean
    images?: boolean
    videos?: boolean
  }
  canvasOverviewMode?: boolean
  canvasMediaLightweightMode?: boolean
  pluginInputProperties?: Record<string, { title?: string; default?: string | number | boolean }>
  onRun?: () => void
  onUpdateContent?: (content: string) => void
  onUpdatePrompt?: (prompt: string) => void
  onUpdateOutputType?: (type: 'image' | 'video' | 'text') => void
  onUpdateModelId?: (modelId: string) => void
  onUpdateModelOperation?: (operation: string) => void
  onUpdateAttachments?: (ids: number[]) => void
  onUpdateParams?: (params: Record<string, unknown>) => void
  onUpdateParamName?: (name: string) => void
  onUpdateParamOrder?: (order: number) => void
  onUpdateParamType?: (type: CanvasParamType) => void
  onApprove?: () => void
  onReject?: () => void
}
