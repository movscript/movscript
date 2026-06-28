import type { MovScriptWorkspaceConfig, MovScriptWorkspaceRootManifest } from '@movscript/workspace/home'
import type { MovScriptWorkspaceService } from '@movscript/workspace'
import type {
  MovScriptEngineContentUnitInput,
  MovScriptEngineAssetInput,
  MovScriptEngineEntityBasicsInput,
  MovScriptEngineEnsureContentUnitInput,
  MovScriptEngineExpressionUnitInput,
  MovScriptEngineKeyframeInput,
  MovScriptEngineProductionInput,
  MovScriptEngineSceneMomentInput,
  MovScriptEngineSceneMomentSettingConnectionInput,
  MovScriptEngineSegmentInput,
  MovScriptEngineSettingInput,
  MovScriptEngineSettingStateInput,
  MovScriptEngineStoryboardInput,
} from '@movscript/engine'
import type { MovScriptContentUnitPromptBuildResult } from '@movscript/prompt'
import type {
  ContentCandidateRecord,
  ContentSourceWorkspaceAudioCuePatch,
  ContentSourceWorkspaceData,
  ContentSourceWorkspaceEditPromptPatch,
  ContentSourceWorkspaceExpressionUnitPatch,
  ContentSourceWorkspaceSnapshot,
  ContentSourceWorkspaceStoryboardTimelinePatch,
  ContentSourceWorkspaceTransitionPatch,
} from '@movscript/core/content'
import type { ElectronMovScriptHomeInput } from './electronApiCore'
import type { ElectronMovScriptWorkspaceContext } from './electronApiWorkspaceContext'

export type ElectronMovScriptWorkspaceConfig = {
  schema: MovScriptWorkspaceConfig['schema']
  updatedAt: string
  modelConfig?: Record<string, unknown>
  agentCatalog?: MovScriptWorkspaceConfig['agentCatalog']
  agentSelection?: MovScriptWorkspaceConfig['agentSelection']
  toolProviders?: Array<Record<string, unknown>>
  modelProviders?: Array<Record<string, unknown>>
  permissions?: Record<string, unknown>
  environment?: Record<string, string>
  providers?: Record<string, Record<string, unknown>>
}

export type ElectronMovScriptWorkspaceConfigSaveInput = {
  providerProfileKey?: string
  modelConfig?: Record<string, unknown> | null
  agentCatalog?: MovScriptWorkspaceConfig['agentCatalog'] | null
  agentSelection?: MovScriptWorkspaceConfig['agentSelection'] | null
  toolProviders?: Array<Record<string, unknown>> | null
  modelProviders?: Array<Record<string, unknown>> | null
  permissions?: Record<string, unknown> | null
  environment?: Record<string, string> | null
  providers?: Record<string, Record<string, unknown>> | null
} & ElectronMovScriptHomeInput

export type ElectronMovScriptWorkspaceRootManifest = MovScriptWorkspaceRootManifest

export type ElectronMovScriptWorkspaceRootResult = {
  movScriptHomeDir: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir: string
  rootDir: string
  controlDir: string
  configTomlPath: string
  manifestPath: string
  providersDir: string
  backendDir: string
  binDir: string
  manifest: ElectronMovScriptWorkspaceRootManifest
}

export type ElectronLocalProjectCreateInput = {
  projectDir: string
  title?: string
  description?: string
  projectId?: string
  overwrite?: boolean
}

export type ElectronLocalProjectOpenInput = {
  projectDir: string
}

export type ElectronLocalProjectInspectInput = {
  projectDir: string
}

export type ElectronLocalProjectInspection = {
  projectDir: string
  exists: boolean
  isDirectory: boolean
  hasWorkspaceManifest: boolean
  hasProjectFile: boolean
  hasLocalConfig: boolean
  hasMovScriptDir: boolean
  projectUid?: string
  projectId?: string
  title?: string
  description?: string
  backendProjectId?: number
  scopeKind?: 'user' | 'org'
  scopeId?: string
  canCreateClean: boolean
  canOpen: boolean
  impacts: string[]
}

export type ElectronLocalProjectBindInput = {
  projectDir: string
  projectUid: string
  backendProjectId: number
  scopeKind: 'user' | 'org'
  scopeId: string
}

export type ElectronLocalProjectResult = {
  projectDir: string
  projectPath: string
  projectUid?: string
  projectId?: string
  project: {
    ID: number
    owner_id: number
    name: string
    description: string
    project_uid?: string
    workspace_path: string
    project_path: string
    local: true
    CreatedAt: string
    UpdatedAt: string
  }
  initializedFiles?: string[]
}

export type ElectronMovScriptWorkspaceFileEntry = {
  name: string
  path: string
  kind: 'file' | 'directory'
  size: number
  updatedAt: string
}

export type ElectronMovScriptWorkspaceFilesInput = ElectronMovScriptHomeInput & {
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
  projectDir?: string
  path?: string
}

export type ElectronMovScriptWorkspaceFilesListResult = {
  rootPath: string
  path: string
  entries: ElectronMovScriptWorkspaceFileEntry[]
}

export type ElectronMovScriptWorkspaceFileReadResult = {
  rootPath: string
  path: string
  content: string
  size: number
  updatedAt: string
  version: string
}

export type ElectronMovScriptWorkspaceMediaFileReadResult = {
  rootPath: string
  path: string
  dataUrl: string
  mimeType: string
  size: number
  updatedAt: string
}

export type ElectronMovScriptWorkspaceFileWriteInput = ElectronMovScriptWorkspaceFilesInput & {
  content: string
  expectedVersion: string | null
}

export type ElectronMovScriptWorkspaceInterpretActionInput = ElectronMovScriptHomeInput & {
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
  projectDir?: string
  expectedWorkspaceVersions?: Record<string, string | null>
}

export type ElectronMovScriptEngineProjectInput = ElectronMovScriptWorkspaceInterpretActionInput

export type ElectronMovScriptEngineContentCanvasInput = ElectronMovScriptEngineProjectInput & {
  canvas?: unknown
  record?: unknown
  id?: string
  canvasId?: string
  canvas_id?: string
  title?: string
  name?: string
  expectedVersion?: string | null
  expected_version?: string | null
}

export type ElectronMovScriptEngineContentCanvasRecord = Record<string, unknown>

export type ElectronMovScriptEngineContentCanvasEntry = {
  path: string
  version: string
  updatedAt: string
  record: ElectronMovScriptEngineContentCanvasRecord
}

export type ElectronMovScriptEngineContentCanvasesListResult = {
  schema: 'movscript.content_canvases.v1'
  canvases: ElectronMovScriptEngineContentCanvasEntry[]
}

export type ElectronMovScriptEngineContentCanvasWriteResult = {
  status: 'written'
  path: string
  version: string
  record: ElectronMovScriptEngineContentCanvasRecord
}

export type ElectronMovScriptEngineContentCanvasRenameResult = {
  status: 'renamed'
  path: string
  version: string
  title: string
  normalizedTitle: string
  record: ElectronMovScriptEngineContentCanvasRecord
  diagnostics: unknown[]
}

export type ElectronMovScriptEngineContentCanvasRunResult = {
  schema: 'movscript.content_canvas_run.v1'
  status: 'completed'
  operationId: string
  operation_id: string
  canvasId: string
  canvas_id: string
  canvas: {
    path: string
    version?: string
    record: ElectronMovScriptEngineContentCanvasRecord
  }
  trace: Record<string, unknown>
  readModel: Record<string, unknown>
  candidateImpact: Record<string, unknown>
  candidate_impact: Record<string, unknown>
}

export type ElectronMovScriptEngineContentCanvasDeleteResult = {
  status: 'deleted'
  path: string
}

export type ElectronMovScriptEngineWorkspaceUpdatedEvent = ElectronMovScriptEngineProjectInput & {
  type: 'MovScriptEngineWorkspaceUpdated'
  reason:
    | 'workspace-mutated'
    | 'content-candidate-created'
    | 'content-candidate-decided'
    | 'content-candidate-selected'
    | 'source-updated'
    | 'hierarchy-node-written'
    | 'interpret-synced'
  sequence: number
  updatedAt: string
}

export type ElectronMovScriptEngineWorkspaceQueryEntitiesInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['queryEntities']>[0]
}

export type ElectronMovScriptEngineWorkspaceQuerySettingsInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['querySettings']>[0]
}

export type ElectronMovScriptEngineWorkspaceQueryAssetsInput = ElectronMovScriptEngineProjectInput & {
  query?: Parameters<MovScriptWorkspaceService['queryAssets']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertSettingInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertSetting']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertAssetInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertAsset']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertScriptInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertScript']>[0]
}

export type ElectronMovScriptEngineWorkspaceReadScriptSourceInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['readScriptSource']>[0]
}

export type ElectronMovScriptEngineContentUnitGenerationPromptReadInput = ElectronMovScriptEngineProjectInput & {
  contentUnitId: string | number
}

export type ElectronMovScriptEngineContentUnitBackendPromptBuildInput = ElectronMovScriptEngineProjectInput & {
  contentUnitId: string | number
  promptText?: string
}

export type ElectronMovScriptEngineContentUnitBackendPromptBuildResult = MovScriptContentUnitPromptBuildResult

export type ElectronMovScriptEngineWorkspaceDeleteEntityInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['deleteEntity']>[0]
}

export type ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['saveProductionSnapshot']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertProjectStandards']>[0]
}

export type ElectronMovScriptEngineWorkspaceUpsertContentUnitInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['upsertContentUnit']>[0]
}

export type ElectronMovScriptEngineContentUnitCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineContentUnitInput
}

export type ElectronMovScriptEngineContentUnitEnsureInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineEnsureContentUnitInput
}

export type ElectronMovScriptEngineTimelineAssemblyContentUnitEnsureInput = ElectronMovScriptEngineProjectInput & {
  payload: Omit<
    MovScriptEngineEnsureContentUnitInput,
    'targetKind' | 'targetId' | 'targetRef' | 'scopeKind' | 'scopeRef' | 'contentUnitType' | 'outputKind'
  > & {
    scopeKind: string
    scopeRef: string | number
    outputKind?: string
  }
}

export type ElectronMovScriptEngineSettingCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineSettingInput
}

export type ElectronMovScriptEngineSettingStateCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineSettingStateInput
}

export type ElectronMovScriptEngineAssetCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineAssetInput
}

export type ElectronMovScriptEngineEntityBasicsUpdateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineEntityBasicsInput
}

export type ElectronMovScriptEngineSceneMomentSettingConnectInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineSceneMomentSettingConnectionInput
}

export type ElectronMovScriptEngineProductionCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineProductionInput
}

export type ElectronMovScriptEngineSegmentCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineSegmentInput
}

export type ElectronMovScriptEngineSceneMomentCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineSceneMomentInput
}

export type ElectronMovScriptEngineExpressionUnitCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineExpressionUnitInput
}

export type ElectronMovScriptEngineKeyframeInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineKeyframeInput
}

export type ElectronMovScriptEngineStoryboardInput = ElectronMovScriptEngineProjectInput & {
  payload: MovScriptEngineStoryboardInput
}

export type ElectronMovScriptEngineWorkspaceSelectCandidateInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['selectCandidate']>[0]
}

export type ElectronMovScriptEngineWorkspaceAppendCandidateInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['appendCandidate']>[0]
}

export type ElectronMovScriptEngineWorkspaceCandidateCreateInput = ElectronMovScriptEngineProjectInput & {
  payload: Parameters<MovScriptWorkspaceService['createAssetSlotCandidate']>[0]
}

export type ElectronMovScriptEngineContentCandidateCreateInput = ElectronMovScriptEngineProjectInput & {
  projectId: number | string
  contentUnitId: string | number
  candidateId: string | number
  source: 'ai_generate' | 'resource_library'
  status: 'queued' | 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'cancelled' | 'imported'
  producer: Record<string, unknown>
  outputs: Array<{
    kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
    resource_id: number
    artifact_ref?: string
    mime_type?: string
    width?: number
    height?: number
    duration_sec?: number
    metadata?: Record<string, unknown>
  }>
  promptSnapshot: Record<string, unknown>
  createdAt: string
}

export type ElectronMovScriptEngineContentCandidateSelectInput = ElectronMovScriptEngineProjectInput & {
  projectId: number | string
  contentUnitId: string | number
  candidateId: string | number
  resourceId?: number
  reason: 'content_source_workspace_selection'
}

export type ElectronMovScriptEngineContentCandidateDecideInput = ElectronMovScriptEngineProjectInput & {
  projectId: number | string
  contentUnitId: string | number
  candidateId: string | number
  resourceId?: number
  decision: 'adopt' | 'reject' | 'defer'
  reason?: string
  metadata?: Record<string, unknown>
  decidedAt?: string
}

export type ElectronMovScriptEngineContentUnitEditPromptInput =
  ElectronMovScriptEngineProjectInput & Parameters<MovScriptWorkspaceService['updateContentUnitEditPrompt']>[0]

export type ElectronMovScriptEngineExpressionUnitInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceExpressionUnitPatch

export type ElectronMovScriptEngineAudioCueInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceAudioCuePatch

export type ElectronMovScriptEngineTransitionInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceTransitionPatch

export type ElectronMovScriptEngineStoryboardTimelineInput =
  ElectronMovScriptEngineProjectInput & ContentSourceWorkspaceStoryboardTimelinePatch

export type ElectronMovScriptEngineHierarchyNodeWriteInput = ElectronMovScriptEngineProjectInput & {
  targetPath: string
  record: Record<string, unknown>
}

export type ElectronProjectGitActionInput = ElectronMovScriptHomeInput & {
  projectDir: string
  projectId?: number | string
  userId?: number | string
  orgId?: number | string
  remoteURL?: string
}

export type ElectronProjectGitActionResult = {
  ok: boolean
  operation: 'commit' | 'init' | 'pull' | 'push' | 'status'
  projectId?: number
  workspaceDir: string
  path: string
  remoteURL?: string
  remoteName?: string
  branch?: string
  initialized?: boolean
  hasGit?: boolean
  isDirty?: boolean
  hasHead?: boolean
  changedFiles?: number
  stdout?: string
  stderr?: string
  error?: string
}
