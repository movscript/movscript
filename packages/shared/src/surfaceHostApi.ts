export interface SurfaceHostDesktopStateInput {
  key: string
}

export interface SurfaceHostDesktopStateSaveInput {
  key: string
  value: unknown
}

export interface SurfaceHostDesktopStateResult {
  value?: unknown
}

export interface SurfaceHostMovScriptHomeInput {
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir?: string
}

export interface SurfaceHostVideoClipInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourcePath?: string
  sourceName?: string
  outputName?: string
  startMs: number
  endMs: number
  mode?: 'fast' | 'accurate'
  fadeInMs?: number
  fadeOutMs?: number
}

export interface SurfaceHostVideoClipResult {
  ok: boolean
  outputPath?: string
  outputName?: string
  mode?: 'fast' | 'accurate'
  fallbackApplied?: boolean
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}

export interface SurfaceHostVideoClipStatus {
  loading?: boolean
  available: boolean
  version?: string
  code?: string
  error?: string
  expectedBundledPath?: string
  path?: string
  platform?: string
  arch?: string
}

export interface SurfaceHostShotCutInput {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export interface SurfaceHostShotCutSegment {
  startSec: number
  endSec: number
}

export interface SurfaceHostShotCutResult {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: SurfaceHostShotCutSegment[]
  error?: string
  code?: string
}

export type SurfaceHostMovScriptProjectInput = Record<string, unknown>

export interface SurfaceHostLocalProjectCreateInput {
  projectDir: string
  title?: string
  description?: string
  projectId?: string
  overwrite?: boolean
}

export interface SurfaceHostLocalProjectOpenInput {
  projectDir: string
}

export interface SurfaceHostLocalProjectInspectInput {
  projectDir: string
}

export interface SurfaceHostLocalProjectInspection {
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

export interface SurfaceHostLocalProjectBindInput {
  projectDir: string
  projectUid: string
  backendProjectId: number
  scopeKind: 'user' | 'org'
  scopeId: string
}

export interface SurfaceHostLocalProjectResult {
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

export interface SurfaceHostProjectGitActionInput extends SurfaceHostMovScriptHomeInput {
  projectDir: string
  projectId?: number | string
  userId?: number | string
  orgId?: number | string
  remoteURL?: string
}

export interface SurfaceHostProjectGitActionResult {
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

export interface SurfaceHostApi {
  openDirectory?: () => Promise<string | null>
  getDesktopState?: (input: SurfaceHostDesktopStateInput) => Promise<SurfaceHostDesktopStateResult>
  setDesktopState?: (input: SurfaceHostDesktopStateSaveInput) => Promise<SurfaceHostDesktopStateResult | void>
  removeDesktopState?: (input: SurfaceHostDesktopStateInput) => Promise<unknown>
  renderMediaPipelineSingleClip?: (input: SurfaceHostVideoClipInput) => Promise<SurfaceHostVideoClipResult>
  getMediaPipelineFFmpegStatus?: () => Promise<SurfaceHostVideoClipStatus>
  analyzeMediaPipelineShotCuts?: (input: SurfaceHostShotCutInput) => Promise<SurfaceHostShotCutResult>
  inspectLocalMovScriptProject?: (input: SurfaceHostLocalProjectInspectInput) => Promise<SurfaceHostLocalProjectInspection>
  createLocalMovScriptProject?: (input: SurfaceHostLocalProjectCreateInput) => Promise<SurfaceHostLocalProjectResult>
  openLocalMovScriptProject?: (input: SurfaceHostLocalProjectOpenInput) => Promise<SurfaceHostLocalProjectResult>
  bindLocalMovScriptProject?: (input: SurfaceHostLocalProjectBindInput) => Promise<SurfaceHostLocalProjectResult>
  initProjectGitWorkspace?: (input: SurfaceHostProjectGitActionInput) => Promise<SurfaceHostProjectGitActionResult>
  getProjectGitWorkspaceStatus?: (input: SurfaceHostProjectGitActionInput) => Promise<SurfaceHostProjectGitActionResult>
  commitProjectGitWorkspace?: (input: SurfaceHostProjectGitActionInput) => Promise<SurfaceHostProjectGitActionResult>
  pullProjectGitWorkspace?: (input: SurfaceHostProjectGitActionInput) => Promise<SurfaceHostProjectGitActionResult>
  pushProjectGitWorkspace?: (input: SurfaceHostProjectGitActionInput) => Promise<SurfaceHostProjectGitActionResult>
  queryMovScriptEngineWorkspaceEntities?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  queryMovScriptEngineWorkspaceSettings?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  queryMovScriptEngineWorkspaceAssets?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  readMovScriptEngineWorkspaceScriptSource?: (input: SurfaceHostMovScriptProjectInput) => Promise<string>
  upsertMovScriptEngineWorkspaceScript?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  readMovScriptEngineContentUnitGenerationPrompt?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  buildMovScriptEngineContentUnitBackendPrompt?: (
    input: SurfaceHostMovScriptProjectInput,
  ) => Promise<{ ok?: boolean; prompt?: Record<string, unknown>; blockers?: unknown[] }>
  readMovScriptEngineContentCanvasReadModel?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  loadMovScriptEngineContentWorkspaceSnapshot?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  loadMovScriptEngineContentWorkspace?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  listMovScriptEngineContentCanvases?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  writeMovScriptEngineContentCanvas?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  renameMovScriptEngineContentCanvas?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  runMovScriptEngineContentCanvas?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  deleteMovScriptEngineContentCanvas?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineSetting?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineSettingState?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineAsset?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineEntityBasics?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  deleteMovScriptEngineWorkspaceEntity?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  connectMovScriptEngineSceneMomentSetting?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineProduction?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineSegment?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineSceneMoment?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineExpressionUnit?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineKeyframe?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineStoryboard?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineContentUnit?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  ensureMovScriptEngineContentUnitForEntity?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  createMovScriptEngineContentCandidate?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  selectMovScriptEngineContentUnitCandidate?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  decideMovScriptEngineContentUnitCandidate?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineContentUnitEditPrompt?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineExpressionUnit?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineAudioCue?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineTransition?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  updateMovScriptEngineStoryboardTimeline?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  writeMovScriptEngineHierarchyNode?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
  syncMovScriptEngineContentWorkspace?: (input: SurfaceHostMovScriptProjectInput) => Promise<any>
}

export function readSurfaceHostApi(): SurfaceHostApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: SurfaceHostApi }).api
}

export type ElectronDesktopStateInput = SurfaceHostDesktopStateInput
export type ElectronDesktopStateSaveInput = SurfaceHostDesktopStateSaveInput
export type ElectronDesktopStateResult = SurfaceHostDesktopStateResult
export type ElectronVideoClipInput = SurfaceHostVideoClipInput
export type ElectronVideoClipResult = SurfaceHostVideoClipResult
export type ElectronVideoClipStatus = SurfaceHostVideoClipStatus
export type ElectronShotCutInput = SurfaceHostShotCutInput
export type ElectronShotCutSegment = SurfaceHostShotCutSegment
export type ElectronShotCutResult = SurfaceHostShotCutResult
export type ElectronMovScriptProjectInput = SurfaceHostMovScriptProjectInput
export type ElectronLocalProjectCreateInput = SurfaceHostLocalProjectCreateInput
export type ElectronLocalProjectOpenInput = SurfaceHostLocalProjectOpenInput
export type ElectronLocalProjectInspectInput = SurfaceHostLocalProjectInspectInput
export type ElectronLocalProjectInspection = SurfaceHostLocalProjectInspection
export type ElectronLocalProjectBindInput = SurfaceHostLocalProjectBindInput
export type ElectronLocalProjectResult = SurfaceHostLocalProjectResult
export type ElectronProjectGitActionInput = SurfaceHostProjectGitActionInput
export type ElectronProjectGitActionResult = SurfaceHostProjectGitActionResult
export type ElectronAPI = SurfaceHostApi
