export type EditingMediaPipelineTaskType =
  | 'timeline_render'
  | 'timeline_hls'
  | 'media_transcode'
  | 'media_reframe'
  | 'backend_project_render'
  | 'backend_project_preview'

export type EditingMediaPipelineTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface EditingMediaPipelineAssetDescriptor {
  id: string
  sourceKind: 'raw_resource' | 'backend_resource' | 'local_file' | 'generated_resource' | 'bytes'
  assetType: 'video' | 'image' | 'audio' | 'text' | 'subtitle'
  resourceId?: number
  resourceVersion?: string | number
  resource_version?: string | number
  localPath?: string
  bytes?: unknown
  base64?: string
  mimeType?: string
  checksum?: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface EditingMediaPipelineOutputSpec {
  format: 'mp4' | 'hls'
  filename?: string
  outputPath?: string
  output_path?: string
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
  hlsVariants?: EditingMediaPipelineHlsVariantSpec[]
  hls_variants?: EditingMediaPipelineHlsVariantSpec[]
}

export interface EditingMediaPipelineHlsVariantSpec {
  name?: string
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface EditingMediaPipelineReframeSpec {
  target?: string
  mode?: 'crop' | 'cover' | 'contain' | 'pad' | 'stretch'
  width?: number
  height?: number
  background?: string
}

export interface EditingMediaPipelineTranscodeSpec {
  videoCodec?: string
  video_codec?: string
  audioCodec?: string
  audio_codec?: string
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface EditingMediaPipelineTaskRequest {
  projectId: string
  taskType: EditingMediaPipelineTaskType
  backend?: string
  backendProject?: Record<string, unknown>
  backend_project?: Record<string, unknown>
  projectDirectory?: string
  project_directory?: string
  renderCommand?: string | string[]
  render_command?: string | string[]
  previewCommand?: string | string[]
  preview_command?: string | string[]
  previewUrl?: string
  preview_url?: string
  command?: string
  args?: string[]
  editingProject?: Record<string, unknown>
  timeline?: Record<string, unknown>
  source?: EditingMediaPipelineAssetDescriptor | Record<string, unknown>
  target?: string
  mode?: string
  reframe?: EditingMediaPipelineReframeSpec
  transcode?: EditingMediaPipelineTranscodeSpec
  resourceCache?: Record<string, unknown>
  resource_cache?: Record<string, unknown>
  resourceDownload?: Record<string, unknown>
  resource_download?: Record<string, unknown>
  output?: EditingMediaPipelineOutputSpec
}

export interface EditingMediaPipelineTaskState {
  taskId: string
  projectId: string
  taskType: EditingMediaPipelineTaskType
  status: EditingMediaPipelineTaskStatus
  progressPercent: number
  currentStep?: string
  outputPath?: string
  outputName?: string
  backend?: string
  projectDirectory?: string
  project_directory?: string
  previewUrl?: string
  preview_url?: string
  surface?: Record<string, unknown>
  hlsManifestPath?: string
  hls_manifest_path?: string
  hlsManifestUrl?: string
  hls_manifest_url?: string
  hlsDirectory?: string
  hls_directory?: string
  hlsSegmentPaths?: string[]
  hls_segment_paths?: string[]
  hlsVariants?: unknown[]
  hls_variants?: unknown[]
  outputResourceId?: number
  outputResource?: unknown
  workspacePath?: string
  manifestPath?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface EditingRuntimeTaskLogs {
  status: 'ok' | 'not_found'
  taskId: string
  logs?: string[]
  text?: string
  logPath?: string
}

export interface EditingRuntimeProjectSaveResult {
  status: 'ok' | 'conflict'
  code?: string
  message?: string
  editingProject?: Record<string, unknown>
  editing_project?: Record<string, unknown>
  projectPath?: string
  project_path?: string
  expectedRevision?: number
  expected_revision?: number
  currentRevision?: number
  current_revision?: number
}

export interface EditingRuntimeProjectGetResult {
  status: 'ok' | 'not_found'
  editingProject?: Record<string, unknown>
  editing_project?: Record<string, unknown>
  projectId?: string
  project_id?: string
  editingProjectId?: string
  editing_project_id?: string
  projectPath?: string
  project_path?: string
}

export interface EditingRuntimeExportImportRequest {
  outputPath: string
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

export interface EditingRuntimeExportImportResult {
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

export interface EditingRuntimeSaveLocalRequest {
  outputPath: string
  output_path?: string
  projectId?: string
  project_id?: string
  taskId?: string
  task_id?: string
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

export interface EditingRuntimeSaveLocalResult {
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
  sizeBytes?: number
  size_bytes?: number
}

export interface EditingRuntimeHlsPublishRequest {
  manifestPath: string
  manifest_path?: string
  segmentPaths?: string[]
  segment_paths?: string[]
  taskId?: string
  task_id?: string
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

export interface EditingRuntimeHlsPublishResult {
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

export interface EditingRuntimeCapabilities {
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
  supportedTaskTypes: EditingMediaPipelineTaskType[]
  supported_task_types: EditingMediaPipelineTaskType[]
  supportedOutputs: Array<'mp4' | 'hls'>
  supported_outputs: Array<'mp4' | 'hls'>
  localHlsPreview: boolean
  local_hls_preview: boolean
  projectStore: boolean
  project_store: boolean
}

export interface EditingRuntimePort {
  getCapabilities?(): Promise<EditingRuntimeCapabilities>
  createTask(request: EditingMediaPipelineTaskRequest): Promise<EditingMediaPipelineTaskState>
  getTask(taskId: string, options?: { projectId?: string }): Promise<EditingMediaPipelineTaskState | null | undefined>
  cancelTask(taskId: string, options?: { projectId?: string }): Promise<EditingMediaPipelineTaskState>
  getTaskLogs?(taskId: string, options?: { projectId?: string }): Promise<EditingRuntimeTaskLogs>
  saveProject?(editingProject: Record<string, unknown>, options?: { expectedRevision?: number }): Promise<EditingRuntimeProjectSaveResult>
  getProject?(input: { projectId?: string; editingProjectId: string }): Promise<EditingRuntimeProjectGetResult>
  importExportResource?(request: EditingRuntimeExportImportRequest): Promise<EditingRuntimeExportImportResult>
  saveLocalExport?(request: EditingRuntimeSaveLocalRequest): Promise<EditingRuntimeSaveLocalResult>
  publishHlsStream?(request: EditingRuntimeHlsPublishRequest): Promise<EditingRuntimeHlsPublishResult>
}
