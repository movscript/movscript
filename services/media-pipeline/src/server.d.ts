import type { EditingRuntimePort } from '@movscript/editing'

export const MEDIA_PIPELINE_CAPABILITIES_ENDPOINT: string
export const MEDIA_PIPELINE_PROBE_ENDPOINT: string
export const MEDIA_PIPELINE_SERVICE_NAME: string
export const MEDIA_PIPELINE_TASK_ACTION_ENDPOINT: string
export const MEDIA_PIPELINE_TASK_CREATE_ENDPOINT: string
export const MEDIA_PIPELINE_SERVICE_CAPABILITIES: readonly string[]
export const MEDIA_PIPELINE_SUPPORTED_TASK_TYPES: readonly string[]
export const MEDIA_PIPELINE_SUPPORTED_OUTPUTS: readonly string[]

export interface MediaPipelineServiceRuntime {
  server: unknown
  host: string
  port: number
  url: string
  close(): Promise<void>
}

export interface MediaPipelineServiceOptions {
  host?: string
  port?: number
  serviceName?: string
  capabilities?: readonly string[]
  supportedTaskTypes?: readonly string[]
  supportedOutputs?: readonly string[]
  runtimePort?: EditingRuntimePort
  probe?: (context: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>
}

export function createMediaPipelineServiceHandler(options?: MediaPipelineServiceOptions): unknown
export function startMediaPipelineService(options?: MediaPipelineServiceOptions): Promise<MediaPipelineServiceRuntime>
export function runMediaPipelineServiceCLI(argv?: string[], env?: NodeJS.ProcessEnv): Promise<void>
