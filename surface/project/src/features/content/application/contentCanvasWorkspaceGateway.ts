import type { ContentCandidateRecord, ContentSourceWorkspaceCandidateCreatePlan, ContentSourceWorkspaceData } from '@movscript/core/content'
import type { GenerationBackendPreflightResult, GenerationIntentPayload } from '@movscript/core/generation'
import type { ParamDef } from '@movscript/shared'
import type { MovScriptWorkspaceService } from '@movscript/workspace'
import type {
  MovScriptEngineAssetInput,
  MovScriptEngineContentUnitInput,
  MovScriptEngineEntityBasicsInput,
  MovScriptEngineEnsureContentUnitInput,
  MovScriptEngineHierarchyNodeWriteInput,
  MovScriptEngineKeyframeInput,
  MovScriptEngineSceneMomentSettingConnectionInput,
  MovScriptEngineSettingInput,
  MovScriptEngineSettingStateInput,
  MovScriptEngineStoryboardInput,
} from '@movscript/engine'

export type ContentCanvasWorkspaceService = Pick<
  MovScriptWorkspaceService,
  | 'queryEntities'
  | 'querySettings'
  | 'queryAssets'
  | 'updateContentUnitEditPrompt'
  | 'readContentUnitGenerationPrompt'
>

export interface ContentCanvasWorkspaceGateway {
  service: ContentCanvasWorkspaceService
  readContentCanvasReadModel?(projectId: number): Promise<unknown>
  syncContentWorkspace?(projectId: number): Promise<unknown>
  loadContentSourceWorkspaceData(projectId: number): Promise<ContentSourceWorkspaceData>
  createSetting(input: MovScriptEngineSettingInput): Promise<{ path: string; record: Record<string, unknown> }>
  createSettingState(input: MovScriptEngineSettingStateInput): Promise<{ path: string; record: Record<string, unknown> }>
  createAsset(input: MovScriptEngineAssetInput): Promise<{ path: string; record: Record<string, unknown> }>
  writeHierarchyNode(input: MovScriptEngineHierarchyNodeWriteInput): Promise<unknown>
  updateEntityBasics(input: MovScriptEngineEntityBasicsInput): Promise<unknown>
  deleteEntity(input: ContentCanvasEntityDeleteInput): Promise<void>
  connectSceneMomentSetting(input: MovScriptEngineSceneMomentSettingConnectionInput): Promise<unknown>
  createProduction(input: ContentCanvasProductionCreateInput): Promise<void>
  createSegment(input: ContentCanvasSegmentCreateInput): Promise<void>
  createSceneMoment(input: ContentCanvasSceneMomentCreateInput): Promise<void>
  createExpressionUnit(input: ContentCanvasExpressionUnitCreateInput): Promise<void>
  createKeyframe(input: MovScriptEngineKeyframeInput): Promise<void>
  createStoryboard(input: MovScriptEngineStoryboardInput): Promise<void>
  createContentUnit(input: MovScriptEngineContentUnitInput): Promise<{ contentUnitPath?: string; path?: string; record: Record<string, unknown> }>
  ensureContentUnitForEntity(input: MovScriptEngineEnsureContentUnitInput): Promise<{ contentUnitPath?: string; path?: string; record: Record<string, unknown> }>
  updateExpressionUnit(input: ContentCanvasExpressionUnitUpdateInput): Promise<void>
  uploadResource(input: ContentCanvasResourceUploadInput): Promise<ContentCanvasUploadedResource>
  createContentUnitCandidate(input: ContentCanvasContentCandidateCreateInput): Promise<ContentCandidateRecord>
  previewContentUnitGenerationPrompt(input: ContentCanvasContentCandidateGenerateInput): Promise<ContentCanvasGenerationPromptPreview>
  preflightContentUnitCandidate(input: ContentCanvasContentCandidateGenerateInput): Promise<GenerationBackendPreflightResult>
  generateContentUnitCandidate(input: ContentCanvasContentCandidateGenerateInput): Promise<ContentCandidateRecord>
  selectContentUnitCandidate(input: ContentCanvasContentCandidateSelectInput): Promise<void>
  decideContentUnitCandidate(input: ContentCanvasContentCandidateDecideInput): Promise<void>
}

export type ContentCanvasProductionCreateInput = {
  projectId: number
  id: string
  title: string
}

export type ContentCanvasEntityDeleteInput = {
  entity: {
    path: string
    record: Record<string, unknown>
  }
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

export type ContentCanvasExpressionUnitCreateInput = {
  projectId: number
  productionId: string
  segmentId: string
  sceneMomentId: string
  id: string
  title: string
  slotKind: string
  kind: string
  outputKind?: string
  text: string
  sceneMomentTitle: string
}

export type ContentCanvasExpressionUnitUpdateInput = {
  projectId: number
  targetPath: string
  title: string
  slotKind?: string
  kind: string
  text: string
  summary: string
  speaker?: string
  note?: string
}

export type ContentCanvasContentCandidateCreateInput = ContentSourceWorkspaceCandidateCreatePlan & {
  projectId: number
}

export type ContentCanvasContentCandidateGenerateInput = {
  projectId: number
  contentUnitId: string
  candidateId: string
  outputKind: 'image' | 'video' | 'audio'
  modelId?: string
  params?: Record<string, string | number | boolean>
  supportedParams?: ParamDef[]
  generationIntent?: GenerationIntentPayload
  generationOperationExplicit?: boolean
  promptText?: string
}

export type ContentCanvasGenerationPromptPreview = {
  text: string
  compiledText?: string
  resourceIds: number[]
  referenceAssets?: NonNullable<GenerationIntentPayload['reference_assets']>
  replacements: Array<Record<string, unknown>>
  blockers: Array<Record<string, unknown>>
}

export type ContentCanvasResourceUploadInput = {
  projectId: number
  file: File
}

export type ContentCanvasUploadedResource = {
  id: number
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  mimeType?: string
}

export type ContentCanvasContentCandidateSelectInput = {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: number
  reason: 'content_source_workspace_selection'
}

export type ContentCanvasContentCandidateDecideInput = {
  projectId: number
  contentUnitId: string
  candidateId: string
  resourceId?: number
  decision: 'adopt' | 'reject' | 'defer'
  reason?: string
  metadata?: Record<string, unknown>
}
