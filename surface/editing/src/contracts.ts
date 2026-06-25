import type {
  MediaAssetDescriptor,
  MediaClip,
  MediaEditingProject,
  MediaTimelineRecipe,
  MediaTrack,
} from '@movscript/editing/browser'

export type ElectronMediaPipelineTaskType =
  | 'timeline_render'
  | 'timeline_hls'
  | 'media_transcode'
  | 'media_reframe'

export type ElectronMediaPipelineTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type ElectronMediaPipelineCapabilities = {
  status: 'ok'
  runtime: 'electron_media_pipeline' | 'headless_media_pipeline'
  available: boolean
  ffmpeg: {
    available: boolean
    path?: string
    version?: string
    code?: string
    error?: string
    expectedBundledPath?: string
    platform?: string
    arch?: string
  }
  supportedTaskTypes: ElectronMediaPipelineTaskType[]
  supported_task_types: ElectronMediaPipelineTaskType[]
  supportedOutputs: Array<'mp4' | 'hls'>
  supported_outputs: Array<'mp4' | 'hls'>
  localHlsPreview: boolean
  local_hls_preview: boolean
  projectStore: boolean
  project_store: boolean
}

export type ElectronMediaPipelineAssetDescriptor = MediaAssetDescriptor & {
  resourceVersion?: string | number
  resource_version?: string | number
  bytes?: ArrayBuffer | Uint8Array | number[]
  base64?: string
}

export type ElectronMediaPipelineClip = Omit<MediaClip, 'asset'> & {
  asset?: ElectronMediaPipelineAssetDescriptor
}

export type ElectronMediaPipelineTrack = Omit<MediaTrack, 'clips'> & {
  clips: ElectronMediaPipelineClip[]
}

export type ElectronMediaPipelineTimelineRecipe = Omit<MediaTimelineRecipe, 'tracks'> & {
  tracks: ElectronMediaPipelineTrack[]
}

export type ElectronMediaPipelineEditingProject = Omit<
  MediaEditingProject,
  'source' | 'timeline' | 'assets' | 'workspace' | 'provenance' | 'createdAt' | 'updatedAt' | 'revision'
> & {
  source?: Record<string, unknown>
  timeline: ElectronMediaPipelineTimelineRecipe
  assets: {
    assets: ElectronMediaPipelineAssetDescriptor[]
  }
  workspace?: Record<string, unknown>
  provenance?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  revision?: number
}

export type ElectronMediaEditingProjectStoreResult = {
  status: 'ok'
  editingProject: ElectronMediaPipelineEditingProject
  editing_project: ElectronMediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export type ElectronMediaEditingProjectSaveResult = ElectronMediaEditingProjectStoreResult | {
  status: 'conflict'
  code: 'EDITING_PROJECT_REVISION_CONFLICT'
  message: string
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  expectedRevision?: number
  expected_revision?: number
  currentRevision?: number
  current_revision?: number
  editingProject: ElectronMediaPipelineEditingProject
  editing_project: ElectronMediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export type ElectronMediaEditingProjectEvent = {
  type: 'saved'
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  revision?: number
  editingProject: ElectronMediaPipelineEditingProject
  editing_project: ElectronMediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export type ElectronMediaEditingProjectGetResult =
  | ElectronMediaEditingProjectStoreResult
  | {
    status: 'not_found'
    projectId: string
    project_id: string
    editingProjectId: string
    editing_project_id: string
    projectPath: string
    project_path: string
  }

export type ElectronMediaEditingProjectListResult = {
  status: 'ok'
  projects: ElectronMediaEditingProjectStoreResult[]
  editingProjects: ElectronMediaPipelineEditingProject[]
  editing_projects: ElectronMediaPipelineEditingProject[]
}

export type ElectronMediaEditingProjectDeleteResult = {
  status: 'ok' | 'not_found'
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  projectPath: string
  project_path: string
}

export type ElectronMediaPipelineHlsVariantSpec = {
  name?: string
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export type ElectronMediaPipelineTaskRequest = {
  projectId: string
  taskType: ElectronMediaPipelineTaskType
  editingProject?: ElectronMediaPipelineEditingProject
  timeline?: ElectronMediaPipelineTimelineRecipe
  source?: ElectronMediaPipelineAssetDescriptor
  target?: string
  mode?: string
  reframe?: {
    target?: string
    mode?: 'crop' | 'cover' | 'contain' | 'pad' | 'stretch'
    width?: number
    height?: number
    background?: string
  }
  transcode?: {
    videoCodec?: string
    video_codec?: string
    audioCodec?: string
    audio_codec?: string
    videoBitrateKbps?: number
    video_bitrate_kbps?: number
    audioBitrateKbps?: number
    audio_bitrate_kbps?: number
  }
  resourceCache?: Record<string, unknown>
  resource_cache?: Record<string, unknown>
  resourceDownload?: Record<string, unknown>
  resource_download?: Record<string, unknown>
  output: {
    format: 'mp4' | 'hls'
    filename?: string
    importToResource?: boolean
    import_to_resource?: boolean
    folderId?: string | number
    folder_id?: string | number
    derivative?: {
      operation: string
      tool?: string
      input_resource_ids?: number[]
      params?: Record<string, unknown>
    }
    hlsVariants?: ElectronMediaPipelineHlsVariantSpec[]
    hls_variants?: ElectronMediaPipelineHlsVariantSpec[]
  }
}

export type ElectronMediaPipelineHlsVariantState = {
  name: string
  manifestPath: string
  manifestName: string
  width?: number
  height?: number
  bandwidth: number
}

export type ElectronMediaPipelineTaskState = {
  taskId: string
  projectId: string
  taskType: ElectronMediaPipelineTaskType
  status: ElectronMediaPipelineTaskStatus
  progressPercent: number
  currentStep?: string
  outputPath?: string
  outputName?: string
  hlsManifestPath?: string
  hls_manifest_path?: string
  hlsManifestUrl?: string
  hls_manifest_url?: string
  hlsDirectory?: string
  hls_directory?: string
  hlsSegmentPaths?: string[]
  hls_segment_paths?: string[]
  hlsVariants?: ElectronMediaPipelineHlsVariantState[]
  hls_variants?: ElectronMediaPipelineHlsVariantState[]
  outputResourceId?: number
  outputResource?: unknown
  workspacePath?: string
  manifestPath?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export type ElectronMediaPipelineTaskEvent = {
  at: string
  taskId: string
  event: string
  state?: ElectronMediaPipelineTaskState
  [key: string]: unknown
}

export type ElectronMediaPipelineTaskLogs = {
  status: 'ok' | 'not_found'
  taskId: string
  logs?: string[]
  text?: string
  logPath?: string
}
