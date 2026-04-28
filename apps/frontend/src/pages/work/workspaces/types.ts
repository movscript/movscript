import type { Pipeline, PipelineNode, ProjectMember } from '@/types'
import type { EntityKind } from '../config'

export interface WorkspaceFrameProps {
  node?: PipelineNode
  pipeline?: Pipeline
  members?: ProjectMember[]
  onNodeUpdated?: (node: PipelineNode) => void
  onOpenTab?: (kind: EntityKind, id: number, label: string) => void
}
