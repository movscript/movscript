import type {
  MediaAssetDescriptor,
  MediaClip,
  MediaEditingProject,
  MediaTimelineRecipe,
  MediaTrack,
} from '@movscript/editing'

export type MediaPipelineTaskType =
  | 'timeline_render'
  | 'timeline_hls'
  | 'media_transcode'
  | 'media_reframe'

export type MediaPipelineTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type MediaPipelineAssetSourceKind = MediaAssetDescriptor['sourceKind']
export type MediaPipelineAssetType = MediaAssetDescriptor['assetType']

export type MediaPipelineAssetDescriptor = MediaAssetDescriptor & {
  resourceVersion?: string | number
  resource_version?: string | number
  bytes?: ArrayBuffer | Uint8Array | number[]
  base64?: string
}

export type MediaPipelineClip = Omit<MediaClip, 'asset'> & {
  asset?: MediaPipelineAssetDescriptor
}

export type MediaPipelineTrack = Omit<MediaTrack, 'clips'> & {
  clips: MediaPipelineClip[]
}

export interface MediaPipelineTimelineRecipe extends Omit<MediaTimelineRecipe, 'tracks'> {
  tracks: MediaPipelineTrack[]
}

export interface MediaPipelineEditingProject extends Omit<
  MediaEditingProject,
  'source' | 'timeline' | 'assets' | 'workspace' | 'provenance' | 'createdAt' | 'updatedAt' | 'revision'
> {
  source?: Record<string, unknown>
  timeline: MediaPipelineTimelineRecipe
  assets: {
    assets: MediaPipelineAssetDescriptor[]
  }
  workspace?: Record<string, unknown>
  provenance?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  revision?: number
}

export interface MediaPipelineEditingProjectEvent {
  type: 'saved'
  projectId: string
  project_id: string
  editingProjectId: string
  editing_project_id: string
  revision?: number
  editingProject: MediaPipelineEditingProject
  editing_project: MediaPipelineEditingProject
  projectPath: string
  project_path: string
}

export interface MediaPipelineOutputSpec {
  format: 'mp4' | 'hls'
  filename?: string
  importToResource?: boolean
  import_to_resource?: boolean
  folderId?: string | number
  folder_id?: string | number
  derivative?: MediaPipelineExportDerivativeSpec
  hlsVariants?: MediaPipelineHlsVariantSpec[]
  hls_variants?: MediaPipelineHlsVariantSpec[]
}

export interface MediaPipelineExportDerivativeSpec {
  operation: string
  tool?: string
  input_resource_ids?: number[]
  params?: Record<string, unknown>
}

export interface MediaPipelineHlsVariantSpec {
  name?: string
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface MediaPipelineHlsVariantState {
  name: string
  manifestPath: string
  manifestName: string
  width?: number
  height?: number
  bandwidth: number
}

export interface MediaPipelineReframeSpec {
  target?: string
  mode?: 'crop' | 'cover' | 'contain' | 'pad' | 'stretch'
  width?: number
  height?: number
  background?: string
}

export interface MediaPipelineTranscodeSpec {
  videoCodec?: string
  video_codec?: string
  audioCodec?: string
  audio_codec?: string
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface MediaPipelineResourceCacheSpec {
  maxBytes?: number
  max_bytes?: number
  maxEntries?: number
  max_entries?: number
}

export interface MediaPipelineResourceDownloadSpec {
  attempts?: number
  retryDelayMs?: number
  retry_delay_ms?: number
  maxRetryDelayMs?: number
  max_retry_delay_ms?: number
}

export interface MediaPipelineTaskRequest {
  projectId: string
  taskType: MediaPipelineTaskType
  editingProject?: MediaPipelineEditingProject
  timeline?: MediaPipelineTimelineRecipe
  source?: MediaPipelineAssetDescriptor
  target?: string
  mode?: string
  reframe?: MediaPipelineReframeSpec
  transcode?: MediaPipelineTranscodeSpec
  resourceCache?: MediaPipelineResourceCacheSpec
  resource_cache?: MediaPipelineResourceCacheSpec
  resourceDownload?: MediaPipelineResourceDownloadSpec
  resource_download?: MediaPipelineResourceDownloadSpec
  output: MediaPipelineOutputSpec
}

export interface MediaPipelineTaskState {
  taskId: string
  projectId: string
  taskType: MediaPipelineTaskType
  status: MediaPipelineTaskStatus
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
  hlsVariants?: MediaPipelineHlsVariantState[]
  hls_variants?: MediaPipelineHlsVariantState[]
  outputResourceId?: number
  outputResource?: unknown
  workspacePath?: string
  manifestPath?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface MediaPipelineTaskLogs {
  status: 'ok' | 'not_found'
  taskId: string
  logs?: string[]
  text?: string
  logPath?: string
}

export interface MediaPipelineTaskEvent {
  at: string
  taskId: string
  event: string
  state?: MediaPipelineTaskState
  [key: string]: unknown
}

export interface MediaPipelineCapabilities {
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
  supportedTaskTypes: MediaPipelineTaskType[]
  supported_task_types: MediaPipelineTaskType[]
  supportedOutputs: Array<'mp4' | 'hls'>
  supported_outputs: Array<'mp4' | 'hls'>
  localHlsPreview: boolean
  local_hls_preview: boolean
  projectStore: boolean
  project_store: boolean
}
