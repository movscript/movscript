import type { EntityKind } from '../config'

export interface WorkspaceFrameProps {
  onOpenTab?: (kind: EntityKind, id: number, label: string) => void
}
