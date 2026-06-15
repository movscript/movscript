export function decodeBase64Utf8(value: string): string {
  try {
    if (typeof atob === 'function') {
      const binary = atob(value)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
  } catch {
    return ''
  }
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function requestIdField(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function agentChatStringPreview(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function agentChatTokenUsageDetail(value: unknown): string {
  if (!isRecord(value)) return agentChatStringPreview(value)
  const detail = [
    tokenUsageBreakdownDetail('total', value.total),
    tokenUsageBreakdownDetail('last', value.last),
    typeof value.modelContextWindow === 'number' ? `model context window: ${value.modelContextWindow}` : '',
  ].filter(Boolean).join('\n')
  return detail || agentChatStringPreview(value)
}

function tokenUsageBreakdownDetail(label: string, value: unknown): string {
  if (!isRecord(value)) return ''
  return [
    `${label}:`,
    typeof value.totalTokens === 'number' ? `total ${value.totalTokens}` : '',
    typeof value.inputTokens === 'number' ? `input ${value.inputTokens}` : '',
    typeof value.cachedInputTokens === 'number' ? `cached ${value.cachedInputTokens}` : '',
    typeof value.outputTokens === 'number' ? `output ${value.outputTokens}` : '',
    typeof value.reasoningOutputTokens === 'number' ? `reasoning ${value.reasoningOutputTokens}` : '',
  ].filter(Boolean).join(' ')
}

export function agentChatGoalDetail(goal: Record<string, unknown>): string {
  const objective = stringField(goal.objective)
  return [
    objective ? `objective: ${objective}` : '',
    stringField(goal.status) ? `status: ${stringField(goal.status)}` : '',
    typeof goal.tokenBudget === 'number' ? `token budget: ${goal.tokenBudget}` : goal.tokenBudget === null ? 'token budget: none' : '',
    typeof goal.tokensUsed === 'number' ? `tokens used: ${goal.tokensUsed}` : '',
    typeof goal.timeUsedSeconds === 'number' ? `time used: ${goal.timeUsedSeconds}s` : '',
  ].filter(Boolean).join('\n') || (objective ?? agentChatStringPreview(goal))
}

export function agentChatRawResponseItemKey(item: Record<string, unknown>): string {
  const type = stringField(item.type) ?? 'responseItem'
  const stableId = stringField(item.id) ?? stringField(item.call_id) ?? stringField(item.name)
  if (stableId) return `${type}:${stableId}`
  return `${type}:${agentChatStableHash(agentChatStringPreview(item))}`
}

export function agentChatRawResponseItemDetail(itemType: string, item: Record<string, unknown>): string {
  const detail = [
    `type: ${itemType}`,
    stringField(item.role) ? `role: ${stringField(item.role)}` : '',
    stringField(item.phase) ? `phase: ${stringField(item.phase)}` : '',
    stringField(item.status) ? `status: ${stringField(item.status)}` : '',
    stringField(item.name) ? `name: ${stringField(item.name)}` : '',
    stringField(item.namespace) ? `namespace: ${stringField(item.namespace)}` : '',
    stringField(item.call_id) ? `call id: ${stringField(item.call_id)}` : '',
    rawResponseItemValueDetail('arguments', item.arguments),
    rawResponseItemValueDetail('input', item.input),
    rawResponseItemValueDetail('output', item.output),
    rawResponseItemValueDetail('execution', item.execution),
    rawResponseItemValueDetail('action', item.action),
    rawResponseItemValueDetail('result', item.result),
    rawResponseItemValueDetail('revised prompt', item.revised_prompt),
    Array.isArray(item.content) ? `content: ${item.content.length} item(s)` : '',
    Array.isArray(item.summary) ? `summary: ${item.summary.length} item(s)` : '',
    Array.isArray(item.tools) ? `tools: ${item.tools.length} item(s)` : '',
    item.encrypted_content ? 'encrypted content: present' : '',
  ].filter(Boolean).join('\n')
  return detail || agentChatStringPreview(item)
}

function rawResponseItemValueDetail(label: string, value: unknown): string {
  const preview = agentChatShortPreview(value)
  return preview ? `${label}: ${preview}` : ''
}

export function agentChatShortPreview(value: unknown): string {
  const preview = agentChatStringPreview(value).replace(/\s+/g, ' ').trim()
  if (!preview) return ''
  return preview.length > 240 ? `${preview.slice(0, 237)}...` : preview
}

function agentChatStableHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function agentChatHookRunDetail(run: Record<string, unknown>): string | null {
  const entries = Array.isArray(run.entries) ? run.entries : []
  const detail = [
    stringField(run.eventName) ? `event: ${stringField(run.eventName)}` : '',
    stringField(run.status) ? `status: ${stringField(run.status)}` : '',
    stringField(run.statusMessage) ? `message: ${stringField(run.statusMessage)}` : '',
    stringField(run.handlerType) ? `handler: ${stringField(run.handlerType)}` : '',
    stringField(run.executionMode) ? `execution: ${stringField(run.executionMode)}` : '',
    stringField(run.scope) ? `scope: ${stringField(run.scope)}` : '',
    stringField(run.sourcePath) ? `source path: ${stringField(run.sourcePath)}` : '',
    stringField(run.source) ? `source: ${stringField(run.source)}` : '',
    numberField(run.durationMs) !== undefined ? `duration: ${numberField(run.durationMs)}ms` : '',
    entries.length ? `entries: ${entries.length}` : '',
    ...entries.slice(0, 3).flatMap((entry, index) => hookEntryDetail(entry, index)),
  ].filter(Boolean).join('\n')
  return detail || null
}

function hookEntryDetail(value: unknown, index: number): string[] {
  if (!isRecord(value)) return []
  const text = stringField(value.text)
  return [
    stringField(value.kind) ? `entry ${index + 1}: ${stringField(value.kind)}` : '',
    text ? `entry ${index + 1} text: ${text}` : '',
  ]
}

export function agentChatConfigWarningDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.details),
    stringField(params.path) ? `path: ${stringField(params.path)}` : '',
    textRangeDetail(params.range),
  ].filter(Boolean).join('\n')
  return detail || null
}

export function agentChatRemoteControlStatusDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.status) ? `status: ${stringField(params.status)}` : '',
    stringField(params.serverName) ? `server: ${stringField(params.serverName)}` : '',
    stringField(params.installationId) ? `installation: ${stringField(params.installationId)}` : '',
    stringField(params.environmentId) ? `environment: ${stringField(params.environmentId)}` : '',
  ].filter(Boolean).join('\n')
  return detail || null
}

export function agentChatWindowsSandboxSetupDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.mode) ? `mode: ${stringField(params.mode)}` : '',
    typeof params.success === 'boolean' ? `success: ${params.success}` : '',
    stringField(params.error) ? `error: ${stringField(params.error)}` : '',
  ].filter(Boolean).join('\n')
  return detail || null
}

function textRangeDetail(value: unknown): string {
  if (!isRecord(value)) return ''
  const start = textPositionDetail(value.start)
  const end = textPositionDetail(value.end)
  if (start && end) return `range: ${start} - ${end}`
  if (start) return `range: ${start}`
  return ''
}

function textPositionDetail(value: unknown): string {
  if (!isRecord(value)) return ''
  const line = numberField(value.line)
  const column = numberField(value.column)
  if (line === undefined || column === undefined) return ''
  return `line ${line}, column ${column}`
}
