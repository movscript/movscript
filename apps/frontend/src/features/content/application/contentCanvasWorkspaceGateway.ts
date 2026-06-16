import type { ContentCandidateRecord, ContentSourceWorkspaceCandidateCreatePlan, ContentSourceWorkspaceData } from '@movscript/core/content'
import type { MovScriptWorkspaceService } from '@movscript/workspace'

export type ContentCanvasWorkspaceService = Pick<
  MovScriptWorkspaceService,
  | 'queryEntities'
  | 'querySettings'
  | 'queryAssets'
  | 'upsertSetting'
  | 'upsertAsset'
  | 'upsertContentUnit'
  | 'updateContentUnitEditPrompt'
>

export interface ContentCanvasWorkspaceGateway {
  service: ContentCanvasWorkspaceService
  loadContentSourceWorkspaceData(projectId: number): Promise<ContentSourceWorkspaceData>
  createProduction(input: ContentCanvasProductionCreateInput): Promise<void>
  createSegment(input: ContentCanvasSegmentCreateInput): Promise<void>
  createSceneMoment(input: ContentCanvasSceneMomentCreateInput): Promise<void>
  createShot(input: ContentCanvasShotCreateInput): Promise<void>
  createExpressionUnit(input: ContentCanvasExpressionUnitCreateInput): Promise<void>
  createKeyframe(input: ContentCanvasKeyframeCreateInput): Promise<void>
  createStoryboard(input: ContentCanvasStoryboardCreateInput): Promise<void>
  createContentUnitCandidate(input: ContentCanvasContentCandidateCreateInput): Promise<ContentCandidateRecord>
  selectContentUnitCandidate(input: ContentCanvasContentCandidateSelectInput): Promise<void>
  writeHierarchyNode(input: ContentCanvasHierarchyNodeWriteInput): Promise<void>
}

export type ContentCanvasProductionCreateInput = {
  projectId: number
  id: string
  title: string
}

export type ContentCanvasSegmentCreateInput = {
  projectId: number
  productionId: string
  id: string
  title: string
  productionTitle: string
}

export type ContentCanvasSceneMomentCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  id: string
  title: string
  segmentTitle: string
}

export type ContentCanvasShotCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  sceneMomentId: string
  id: string
  title: string
}

export type ContentCanvasExpressionUnitCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  sceneMomentId: string
  id: string
  title: string
  kind: string
  text: string
  sceneMomentTitle: string
}

export type ContentCanvasKeyframeCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  sceneMomentId: string
  shotId: string
  id: string
  title: string
  shotTitle: string
}

export type ContentCanvasStoryboardCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  sceneMomentId: string
  shotId: string
  id: string
  title: string
}

export type ContentCanvasContentCandidateCreateInput = ContentSourceWorkspaceCandidateCreatePlan & {
  projectId: number
}

export type ContentCanvasContentCandidateSelectInput = {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: number
  reason: 'content_source_workspace_selection'
}

export type ContentCanvasHierarchyNodeWriteInput = {
  projectId: number
  targetPath: string
  record: Record<string, unknown>
}
