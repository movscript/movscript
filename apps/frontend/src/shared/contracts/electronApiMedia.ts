export type ElectronVideoClipInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourcePath?: string
  sourceName?: string
  startMs: number
  endMs: number
  outputName?: string
  mode?: 'fast' | 'accurate'
  fadeInMs?: number
  fadeOutMs?: number
}

export type ElectronVideoClipResult = {
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

export type ElectronTimelineVideoInput = {
  clips: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    startMs: number
    endMs: number
    timelineStartMs?: number
    layerIndex?: number
    volume?: number
    muted?: boolean
    speed?: number
    fadeInMs?: number
    fadeOutMs?: number
    fit?: 'crop' | 'contain' | 'cover' | 'none'
    cropLeftPercent?: number
    cropRightPercent?: number
    cropTopPercent?: number
    cropBottomPercent?: number
  }>
  captions?: Array<{
    startMs: number
    endMs: number
    text: string
    layerIndex?: number
    fontSize?: number
    yPercent?: number
    textColor?: string
    boxOpacityPercent?: number
  }>
  audioClips?: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    startMs: number
    endMs: number
    timelineStartMs: number
    volume?: number
    speed?: number
    fadeInMs?: number
    fadeOutMs?: number
  }>
  overlays?: Array<{
    sourceData?: ArrayBuffer | Uint8Array
    sourceName?: string
    sourceKind?: 'image' | 'video'
    startMs: number
    endMs: number
    sourceStartMs?: number
    sourceEndMs?: number
    layerIndex?: number
    volume?: number
    muted?: boolean
    speed?: number
    fadeInMs?: number
    fadeOutMs?: number
    cropLeftPercent?: number
    cropRightPercent?: number
    cropTopPercent?: number
    cropBottomPercent?: number
    xPercent?: number
    yPercent?: number
    scalePercent?: number
    opacityPercent?: number
  }>
  outputName?: string
  width?: number
  height?: number
  background?: string
}

export type ElectronTimelineVideoResult = {
  ok: boolean
  outputName?: string
  data?: Uint8Array
  size?: number
  mimeType?: string
  error?: string
  code?: string
  missingFilters?: string[]
}

export type ElectronVideoClipStatus = {
  available: boolean
  path?: string
  version?: string
  error?: string
  code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
  expectedBundledPath?: string
  platform?: string
  arch?: string
}

export type ElectronShotCutInput = {
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
  durationSec?: number
  sceneThreshold?: number
  minShotDurationSec?: number
  maxShotDurationSec?: number
}

export type ElectronShotCutSegment = {
  startSec: number
  endSec: number
}

export type ElectronShotCutResult = {
  ok: boolean
  strategy?: 'scene_detection' | 'even'
  shots?: ElectronShotCutSegment[]
  error?: string
  code?: string
}

export type ElectronMediaPipelineTaskType =
  | 'timeline_render'
  | 'timeline_hls'
  | 'media_transcode'
  | 'media_reframe'

export type ElectronMediaPipelineTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type ElectronMediaPipelineCapabilities = {
  status: 'ok'
  runtime: 'electron_media_pipeline'
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

export type ElectronMediaExportImportInput = {
  outputPath?: string
  output_path?: string
  filename?: string
  mimeType?: string
  mime_type?: string
  folderId?: string | number
  folder_id?: string | number
  derivative?: {
    operation: string
    tool?: string
    input_resource_ids?: number[]
    params?: Record<string, unknown>
  }
  operation?: string
  tool?: string
  inputResourceIds?: Array<string | number>
  input_resource_ids?: Array<string | number>
  sourceResourceId?: string | number
  source_resource_id?: string | number
  sourceResourceIds?: Array<string | number>
  source_resource_ids?: Array<string | number>
  params?: Record<string, unknown>
}

export type ElectronMediaExportImportResult = {
  status: 'ok'
  resourceId: number
  resource_id: number
  resource: unknown
  outputPath: string
  output_path: string
  filename: string
  mimeType: string
  mime_type: string
}

export type ElectronMediaExportSaveLocalInput = {
  outputPath?: string
  output_path?: string
  savePath?: string
  save_path?: string
  saveDirectory?: string
  save_directory?: string
  hlsDirectory?: string
  hls_directory?: string
  segmentPaths?: string[]
  segment_paths?: string[]
  filename?: string
}

export type ElectronMediaExportSaveLocalResult = {
  status: 'ok'
  outputPath: string
  output_path: string
  savePath?: string
  save_path?: string
  saveDirectory?: string
  save_directory?: string
  manifestPath?: string
  manifest_path?: string
  savedFiles?: string[]
  saved_files?: string[]
  filename: string
  sizeBytes: number
  size_bytes: number
}

export type ElectronMediaHlsPublishInput = {
  manifestPath?: string
  manifest_path?: string
  segmentPaths?: string[]
  segment_paths?: string[]
  title?: string
  projectId?: string | number
  project_id?: string | number
  sourceResourceId?: string | number
  source_resource_id?: string | number
  sourceDerivativeId?: string | number
  source_derivative_id?: string | number
  durationMs?: number
  duration_ms?: number
  width?: number
  height?: number
}

export type ElectronMediaHlsPublishResult = {
  status: 'ok'
  streamId: number
  stream_id: number
  stream: unknown
  media_stream: unknown
  manifestUrl?: string
  manifest_url?: string
  presignedManifestUrl?: string
  presigned_manifest_url?: string
  segmentBaseUrl?: string
  segment_base_url?: string
  segments?: unknown
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
  resourceCache?: {
    maxBytes?: number
    max_bytes?: number
    maxEntries?: number
    max_entries?: number
  }
  resource_cache?: {
    maxBytes?: number
    max_bytes?: number
    maxEntries?: number
    max_entries?: number
  }
  resourceDownload?: {
    attempts?: number
    retryDelayMs?: number
    retry_delay_ms?: number
    maxRetryDelayMs?: number
    max_retry_delay_ms?: number
  }
  resource_download?: {
    attempts?: number
    retryDelayMs?: number
    retry_delay_ms?: number
    maxRetryDelayMs?: number
    max_retry_delay_ms?: number
  }
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

export type ElectronMediaPipelineHlsVariantSpec = {
  name?: string
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
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
import type {
  MediaAssetDescriptor,
  MediaClip,
  MediaEditingProject,
  MediaTimelineRecipe,
  MediaTrack,
} from '@movscript/editing'
