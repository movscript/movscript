import type { AgentDebugFieldGuideItem } from './types.js'

export const DEBUG_BUNDLE_SCHEMA_V2 = 'movscript.agent-run-debug-bundle.v2'
export const DEBUG_BUNDLE_SCHEMA_URL_V2 = 'https://movscript.dev/schemas/agent-run-debug-bundle-v2.schema.json'
export const DEBUG_BUNDLE_CAPABILITIES = [
  'runSummary',
  'readinessChecklist',
  'runtimeSummary',
  'runtimeFrames',
  'fullDebugEvents',
  'fullContextDiffs',
  'fullPromptPayloads',
  'attentionEvents',
  'pendingActions',
  'fieldGuide',
  'redactedDebugData',
] as const

export const AGENT_DEBUG_FIELD_GUIDE: AgentDebugFieldGuideItem[] = [
  {
    id: 'model_request',
    label: '模型请求',
    description: '发送给模型网关的请求摘要、计数、hash 与可定位的 evidence/ref。',
  },
  {
    id: 'model_response',
    label: '模型响应',
    description: '网关响应的状态、headers 摘要、body/content hash、usage 和 finish reason。',
  },
  {
    id: 'history_write',
    label: '历史写入',
    description: 'assistant 回复是否已经进入线程历史，后续 run 可能会再次带入上下文。',
  },
  {
    id: 'missing_data',
    label: '缺失项',
    description: '服务端 debug view 基于全量 trace 计算；如果仍缺失，通常是旧运行、异常中断或当时未采集。',
  },
]
