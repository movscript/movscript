import type { RawResource } from './resources'

export interface DebugHTTPExchange {
  success: boolean
  model_id: string
  endpoint: string
  method: string
  request_headers?: Record<string, string>
  request_body: string
  prompt_name?: string
  system_prompt?: string
  user_prompt?: string
  compiled_prompt?: string
  prompt_messages?: Array<{ role: string; content: string }>
  response_status: number
  response_body: string
  latency_ms: number
  error?: string
}

export interface DebugCallResult extends DebugHTTPExchange {
  // Job context (filled by worker before adapter call)
  job_type?: string
  job_model_def_id?: string
  job_resolved_prompt?: string
  job_input_resource_ids?: number[]
  resource_diagnostics?: ResourceDiagnostic[]
  // Every provider HTTP exchange for multi-step jobs. The inherited flat fields
  // mirror the latest call for compatibility.
  calls?: DebugHTTPExchange[]
}

export interface ResourceDiagnostic {
  resource_id: number
  resource_type?: string
  provider_id?: string
  provider_kind?: string
  supports_provider_asset_uri: boolean
  mode: string
  reason: string
  next_action?: string
  asset_uri?: string
  asset_group_id?: string
  certification_status?: string
  certification_provider_id?: string
  available_certification_keys?: string[]
  available_certification_providers?: string[]
  trust?: Record<string, unknown>
}

export interface RawCallResult {
  url: string
  method: string
  request_headers: Record<string, string>
  request_body: string
  response_status: number
  response_body: string
  latency_ms: number
  error?: string
}

export interface JobDetail extends Job {
  debug_detail?: DebugCallResult
}

export interface JobStateTraceEntry {
  state: string
  status: 'running' | 'succeeded' | 'failed'
  message?: string
  error?: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface Job {
  ID: number
  user_id: number
  model_id?: string
  provider_name?: string
  model_display?: string
  model_identifier?: string
  job_type: string  // image | image_edit | video | video_i2v | video_v2v | audio_tts | audio_transcribe | audio_translate | audio_music | audio_sfx | audio_chat | voice_clone | voice_design | subtitle_align | subtitle_translate
  feature_key?: string  // source/audit key supplied by the caller
  title?: string
  status: JobStatus
  prompt: string
  extra_params?: string // JSON: size, quality, style, etc.
  aspect_ratio?: string // e.g. "16:9", "9:16"
  duration?: number     // seconds; 0 = model default
  request_context?: string // JSON snapshot of model, input resources, and params at creation time
  input_resource_id?: number
  input_resource_ids?: string // JSON array e.g. "[1,2]"
  input_resources?: RawResource[]
  output_resource_id?: number
  output_resource_ids?: number[]
  output_resource?: RawResource
  provider_task_id?: string
  provider_task_kind?: string
  provider_task_status?: string
  provider_task_history?: string
  error_msg?: string
  debug_info?: string  // JSON-encoded DebugCallResult
  execution_state?: string
  state_trace?: string // JSON-encoded JobStateTraceEntry[]
  started_at?: string
  finished_at?: string
  project_id?: number
  CreatedAt: string
  UpdatedAt: string
}
