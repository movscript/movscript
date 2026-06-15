import type { AgentTraceEvent } from '@/shared/infrastructure/providerSessionClient'
import { isRecord } from '@/shared/domain/jsonValue'
import type {
  AgentTraceContextGroup,
  AgentTraceModelMessageContentPart,
  AgentTraceModelMessageDetail,
  AgentTraceModelMessageGroup,
  AgentTraceModelToolDetail,
} from './types'

export function group(label: string, items: Array<{ label: string; value?: string }>): AgentTraceContextGroup {
  return { label, items: items.flatMap((entry) => entry.value ? [{ label: entry.label, value: entry.value }] : []) }
}

export function item(label: string, value: unknown): { label: string; value?: string } {
  if (value === undefined || value === null || value === '') return { label }
  return { label, value: String(value) }
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function headerEntries(headers: Record<string, unknown> | undefined): Array<{ name: string; value: string }> {
  if (!headers) return []
  return Object.entries(headers)
    .flatMap(([name, value]) => {
      const normalized = stringValue(name)
      const label = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
      return normalized && label ? [{ name: normalized, value: label }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function usageCachedInputTokens(usage: Record<string, unknown> | undefined): number | undefined {
  const details = recordValue(usage?.input_tokens_details) ?? recordValue(usage?.prompt_tokens_details)
  return numberValue(usage?.cached_input_tokens)
    ?? numberValue(usage?.cache_read_input_tokens)
    ?? numberValue(details?.cached_tokens)
}

export function usageReasoningTokens(usage: Record<string, unknown> | undefined): number | undefined {
  const details = recordValue(usage?.output_tokens_details) ?? recordValue(usage?.completion_tokens_details)
  return numberValue(usage?.reasoning_tokens) ?? numberValue(details?.reasoning_tokens)
}

export function booleanLabel(value: unknown): string | undefined {
  return typeof value === 'boolean' ? (value ? '是' : '否') : undefined
}

export function modelSubmittedBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return recordValue(body?.sdk_body) ?? body
}

export function modelSubmittedTools(body: Record<string, unknown> | undefined, submittedBody: Record<string, unknown> | undefined): unknown[] {
  const submittedTools = arrayValue(submittedBody?.tools)
  if (submittedTools) return submittedTools
  return arrayValue(body?.tools) ?? []
}

export function modelToolChoiceValue(value: unknown): string | undefined {
  const direct = stringValue(value)
  if (direct) return direct
  const record = recordValue(value)
  if (!record) return undefined
  const type = stringValue(record.type)
  const name = stringValue(record.name) ?? stringValue(recordValue(record.function)?.name)
  if (type && name) return `${type}:${name}`
  return type ?? name
}

export function modelToolDetail(tool: unknown, index: number): AgentTraceModelToolDetail {
  const record = recordValue(tool)
  const toolBody = recordValue(record?.function) ?? record
  const parameters = recordValue(toolBody?.parameters)
  const properties = recordValue(parameters?.properties)
  return {
    index: index + 1,
    name: stringValue(toolBody?.name) ?? stringValue(record?.name) ?? `tool_${index + 1}`,
    description: stringValue(toolBody?.description),
    parameterKeys: properties ? Object.keys(properties) : [],
  }
}

export function toolFieldValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') return previewText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map((entry) => stringValue(entry) ?? (typeof entry === 'number' || typeof entry === 'boolean' ? String(entry) : undefined)).filter(Boolean)
    return values.length > 0 ? values.slice(0, 6).join(', ') : `${value.length} 项`
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    return keys.length > 0 ? keys.slice(0, 8).join(', ') : undefined
  }
  return undefined
}

export function toolFieldLabel(key: string): string {
  switch (key) {
    case 'artifactId': return '产物 ID'
    case 'findings': return '发现'
    case 'subagentName': return '子 agent'
    case 'taskId': return '任务 ID'
    case 'error': return '错误'
    case 'result': return '结果'
    default: return key.replace(/[_-]/g, ' ')
  }
}

export function isSensitiveFieldName(key: string): boolean {
  return /authorization|cookie|api[-_]?key|token|secret|signed/i.test(key)
}

export function traceEventDurationMs(event: AgentTraceEvent, data: Record<string, unknown> | undefined = recordValue(event.data)): number | undefined {
  const durationMs = nonNegativeNumberValue(data?.durationMs) ?? nonNegativeNumberValue(event.durationMs)
  if (durationMs !== undefined) return durationMs
  if (!event.createdAt || !event.completedAt) return undefined
  const startMs = new Date(event.createdAt).getTime()
  const endMs = new Date(event.completedAt).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return undefined
  return endMs - startMs
}

export function formatTraceEventDuration(event: AgentTraceEvent, data: Record<string, unknown> | undefined = recordValue(event.data)): string | undefined {
  const durationMs = traceEventDurationMs(event, data)
  return durationMs !== undefined ? formatDurationMs(durationMs) : undefined
}

export function nonNegativeNumberValue(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && number >= 0 ? Math.round(number) : undefined
}

export function unknownLabel(scope: string, value: string): string {
  return `未知${scope} (${value})`
}

export function tracePhaseLabel(phase: string | undefined): string | undefined {
  switch (phase) {
    case 'request': return '请求'
    case 'response': return '响应'
    case 'retry': return '重试'
    case 'error': return '错误'
    default: return phase
  }
}

export function localizedTraceTitle(title: string): string | undefined {
  switch (title) {
    case 'Worker started': return '执行器启动'
    case 'Planner started': return '规划器启动'
    case 'Asset review tool call': return '素材风险审计工具调用'
    case 'Provider work dispatch tool call': return '异步任务调度工具调用'
    case 'Thread history compacted': return '压缩线程历史'
    case 'Reference searched': return '检索参考源'
    case 'Reference loaded': return '加载参考片段'
    case 'Tool result body summarized': return '压缩工具结果正文'
    default: return undefined
  }
}

export function localizedTraceSummary(summary: string): string | undefined {
  const httpCall = summary.match(/^([A-Z]+)\s+(.+)$/)
  if (httpCall && httpCall[1] && httpCall[2]?.startsWith('/')) return `请求 ${httpCall[1]} ${httpCall[2]}`
  const httpResponse = summary.match(/^HTTP\s+(\d{3})(?:\s+in\s+(.+))?$/)
  if (httpResponse) return `HTTP ${httpResponse[1]}${httpResponse[2] ? `，耗时 ${httpResponse[2]}` : ''}`
  const promptComposed = summary.match(/^Prompt composed(?:\s+for\s+(.+))?\.?$/i)
  if (promptComposed) {
    const target = promptComposed[1]?.replace(/\.$/, '')
    return target ? `已组装模型上下文：${target}` : '已组装模型上下文。'
  }
  switch (summary) {
    case 'Planner started taskGraph orchestration.': return '规划器开始编排计划。'
    case 'Found missing hero visual coverage.': return '发现缺少主视觉覆盖。'
    case 'Spawned worker Einstein.': return '已启动执行器 Einstein。'
    default: return undefined
  }
}

export function messageRoleLabel(role: string): string {
  switch (role) {
    case 'system': return '系统'
    case 'user': return '用户'
    case 'assistant': return '助手'
    case 'tool': return '工具'
    default: return role
  }
}

export function modelToolChoiceLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'auto': return '自动选择 (auto)'
    case 'none': return '不调用工具 (none)'
    case 'required': return '必须调用工具 (required)'
    default: return value
  }
}

export function modelFinishReasonLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'stop': return '正常结束 (stop)'
    case 'length': return '达到长度限制 (length)'
    case 'tool_calls': return '触发工具调用 (tool_calls)'
    case 'content_filter': return '内容过滤 (content_filter)'
    default: return value
  }
}

export function messageSourceLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'model': return '模型输出 (model)'
    case 'runtime': return 'Runtime 会话 (runtime)'
    case 'tool': return '工具结果 (tool)'
    case 'user': return '用户 (user)'
    default: return value
  }
}

export function formatMs(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)}ms`
}

export function formatDurationMs(value: number): string {
  const ms = Math.round(value)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function previewText(value: unknown): string | undefined {
  const text = stringValue(value)
  if (!text) return undefined
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}

export function messageContentText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function modelMessageContentParts(value: unknown): AgentTraceModelMessageContentPart[] {
  if (typeof value === 'string') {
    return value ? [{ index: 1, type: 'text', typeLabel: '文本', text: value, chars: value.length }] : []
  }
  const entries = arrayValue(value)
  if (!entries) {
    const text = messageContentText(value)
    return text ? [{ index: 1, type: 'metadata', typeLabel: '内容', text, chars: text.length }] : []
  }
  return entries.flatMap((entry, index): AgentTraceModelMessageContentPart[] => {
    const part = recordValue(entry)
    if (!part) {
      const text = messageContentText(entry)
      return text ? [{ index: index + 1, type: 'metadata', typeLabel: '内容', text, chars: text.length }] : []
    }
    const type = stringValue(part.type)
    const text = stringValue(part.text) ?? stringValue(part.input_text) ?? stringValue(part.content)
    if ((type === 'text' || type === 'input_text' || type === 'output_text') && text) {
      return [{ index: index + 1, type: 'text', typeLabel: modelMessagePartTypeLabel(type), text, chars: text.length }]
    }
    const image = modelMessageImagePart(part)
    if (image) {
      return [{
        index: index + 1,
        type: 'image',
        typeLabel: modelMessagePartTypeLabel(type ?? 'image'),
        ...image,
      }]
    }
    if (text) return [{ index: index + 1, type: 'text', typeLabel: modelMessagePartTypeLabel(type), text, chars: text.length }]
    const fallback = messageContentText(part)
    return fallback ? [{ index: index + 1, type: 'metadata', typeLabel: modelMessagePartTypeLabel(type), text: fallback, chars: fallback.length }] : []
  })
}

function modelMessageImagePart(part: Record<string, unknown>): Omit<Extract<AgentTraceModelMessageContentPart, { type: 'image' }>, 'index' | 'type' | 'typeLabel'> | undefined {
  const directUrl = stringValue(part.image_url) ?? stringValue(part.imageUrl) ?? stringValue(part.url)
  const imageRecord = recordValue(part.image_url) ?? recordValue(part.image) ?? recordValue(part.input_image)
  const imageUrl = directUrl ?? stringValue(imageRecord?.url) ?? stringValue(imageRecord?.image_url) ?? stringValue(part.dataUrl) ?? stringValue(part.data_url)
  const metadata = !imageUrl ? messageContentText(part) : undefined
  const isImageType = (stringValue(part.type) ?? '').includes('image') || !!imageRecord || !!imageUrl
  if (!isImageType) return undefined
  return {
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageMimeType(imageUrl) ? { mimeType: imageMimeType(imageUrl) } : stringValue(part.mimeType) ? { mimeType: stringValue(part.mimeType) } : {}),
    ...(stringValue(part.detail) ? { detail: stringValue(part.detail) } : stringValue(imageRecord?.detail) ? { detail: stringValue(imageRecord?.detail) } : {}),
    ...(imageUrl ? { chars: imageUrl.length } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function imageMimeType(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^data:([^;,]+)[;,]/i.exec(value)
  return match?.[1]
}

function modelMessagePartTypeLabel(type: string | undefined): string {
  switch (type) {
    case 'text':
    case 'input_text':
    case 'output_text':
      return '文本'
    case 'image':
    case 'image_url':
    case 'input_image':
      return '图片'
    default:
      return type ? type.replace(/_/g, ' ') : '内容'
  }
}

export function modelMessageGroups(messages: AgentTraceModelMessageDetail[]): AgentTraceModelMessageGroup[] {
  const order = ['system', 'user', 'assistant', 'tool']
  const groups = new Map<string, AgentTraceModelMessageGroup>()
  for (const message of messages) {
    const key = message.role || 'unknown'
    const group = groups.get(key) ?? {
      role: key,
      roleLabel: message.roleLabel,
      count: 0,
      contentChars: 0,
      imageCount: 0,
      messages: [],
    }
    group.count += 1
    group.contentChars += message.contentChars
    group.imageCount += message.imageCount
    group.messages.push(message)
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort((a, b) => {
    const left = order.indexOf(a.role)
    const right = order.indexOf(b.role)
    if (left === -1 && right === -1) return a.role.localeCompare(b.role)
    if (left === -1) return 1
    if (right === -1) return -1
    return left - right
  })
}

export function countMessagesByRole(messages: unknown[] | undefined): Record<'system' | 'user' | 'assistant' | 'tool', number> {
  const counts = { system: 0, user: 0, assistant: 0, tool: 0 }
  for (const message of messages ?? []) {
    const role = stringValue(recordValue(message)?.role)
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
      counts[role] += 1
    }
  }
  return counts
}
