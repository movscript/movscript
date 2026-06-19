import type { MovScriptWorkspaceKind } from '@/shared/contracts/movscriptWorkspace'

export type { MovScriptWorkspaceKind } from '@/shared/contracts/movscriptWorkspace'

export type WorkspaceArtifactStatus = 'workspace' | 'accepted' | 'rejected' | 'applied' | 'superseded'

export interface WorkspaceArtifact {
  id: string
  filePath?: string
  projectId?: number
  kind: MovScriptWorkspaceKind
  title: string
  content: string
  status: WorkspaceArtifactStatus
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  createdByRunId?: string
  createdByThreadId?: string
  appliedByUserId?: number | string
  appliedAt?: string
  rejectedReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkspaceArtifactApplyReview {
  workspaceId: string
  workspaceTitle: string
  workspaceKind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  currentValue: unknown
  proposedValue: unknown
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface WorkspaceArtifactApplyPreview {
  status: 'preview' | 'applied'
  review: WorkspaceArtifactApplyReview
  workspace: WorkspaceArtifact
  message: string
  backendApply?: Record<string, unknown>
}
