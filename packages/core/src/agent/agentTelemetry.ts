import type { JSONValue } from './protocolJson.js'

export const AGENT_CLIENT_TELEMETRY_SCHEMA = 'movscript.agent.client-telemetry.v1'

export type AgentTelemetryMetricUnit = 'ms' | 'bytes' | 'count' | 'score'
export type AgentTelemetryLogLevel = 'info' | 'warning' | 'error'
export type AgentTelemetryLabelValue = string | number | boolean

export const AGENT_TELEMETRY_LABEL_KEYS = [
  'area',
  'component',
  'kind',
  'level',
  'method',
  'route_group',
  'role',
  'stage',
  'status',
  'status_class',
  'tool_name',
  'transport',
  'vital',
] as const

export type AgentTelemetryLabelKey = typeof AGENT_TELEMETRY_LABEL_KEYS[number]

export const AGENT_TELEMETRY_REPORTABLE_METRICS = [
  'frontend_agent_network_request_duration_ms',
  'frontend_agent_composer_input_latency_ms',
  'frontend_agent_composer_serialize_ms',
  'frontend_agent_send_stage_latency_ms',
  'frontend_agent_stream_buffer_lifetime_ms',
  'frontend_agent_stream_flush_total',
  'frontend_agent_stream_text_chars',
  'frontend_agent_stream_update_total',
  'frontend_agent_timeline_page_duration_ms',
  'frontend_agent_timeline_page_items',
  'frontend_agent_timeline_page_payload_bytes',
  'frontend_agent_thread_restore_duration_ms',
  'frontend_agent_thread_restore_message_count',
  'frontend_agent_thread_restore_payload_bytes',
  'frontend_storage_operation_duration_ms',
  'frontend_storage_payload_bytes',
  'frontend_web_vital_fcp_ms',
  'frontend_web_vital_lcp_ms',
  'frontend_web_vital_ttfb_ms',
  'frontend_web_vital_cls_score',
  'frontend_web_vital_inp_ms',
  'frontend_ui_errors_total',
  'movscript_agent_operation_duration_ms',
  'movscript_agent_operation_phase_delta_ms',
  'movscript_agent_storage_file_bytes',
  'movscript_agent_storage_flush_duration_ms',
  'movscript_agent_storage_operation_duration_ms',
  'movscript_agent_trace_store_operation_duration_ms',
  'movscript_agent_trace_span_duration_ms',
  'movscript_agent_trace_event_total',
] as const

export type AgentTelemetryReportableMetricName = typeof AGENT_TELEMETRY_REPORTABLE_METRICS[number]

export interface AgentTelemetryMetricSample {
  name: string
  unit: AgentTelemetryMetricUnit
  value: number
  labels?: Partial<Record<AgentTelemetryLabelKey, AgentTelemetryLabelValue>>
}

export interface AgentTelemetryLogSample {
  level: AgentTelemetryLogLevel
  area: string
  kind: string
}

export interface AgentClientTelemetryBatchV1 {
  schema: typeof AGENT_CLIENT_TELEMETRY_SCHEMA
  operations?: JSONValue[]
  longTasks?: JSONValue[]
  metrics?: AgentTelemetryMetricSample[]
  logs?: AgentTelemetryLogSample[]
}

export function isAgentTelemetryReportableMetricName(name: string): name is AgentTelemetryReportableMetricName {
  return (AGENT_TELEMETRY_REPORTABLE_METRICS as readonly string[]).includes(name)
}

export function normalizeAgentTelemetryLabelValue(value: unknown, fallback = 'unknown'): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return fallback
  const normalized = String(value).trim()
  return normalized || fallback
}

export function sanitizeAgentTelemetryLabels(
  labels?: Partial<Record<AgentTelemetryLabelKey | string, AgentTelemetryLabelValue | undefined>>,
): Record<string, string> {
  if (!labels) return {}
  const result: Record<string, string> = {}
  for (const key of AGENT_TELEMETRY_LABEL_KEYS) {
    const value = labels[key]
    if (value === undefined) continue
    result[key] = normalizeAgentTelemetryLabelValue(value)
  }
  return result
}

export function createAgentTelemetryMetricSample(input: {
  name: string
  unit: AgentTelemetryMetricUnit
  value: number
  labels?: Partial<Record<AgentTelemetryLabelKey | string, AgentTelemetryLabelValue | undefined>>
}): AgentTelemetryMetricSample {
  return {
    name: input.name,
    unit: input.unit,
    value: Number.isFinite(input.value) && input.value > 0 ? input.value : 0,
    labels: sanitizeAgentTelemetryLabels(input.labels),
  }
}

export function createAgentTelemetryLogSample(input: {
  level: AgentTelemetryLogLevel
  area: unknown
  kind: unknown
}): AgentTelemetryLogSample {
  return {
    level: input.level,
    area: normalizeAgentTelemetryLabelValue(input.area, 'agent_frontend'),
    kind: normalizeAgentTelemetryLabelValue(input.kind, 'unknown'),
  }
}
