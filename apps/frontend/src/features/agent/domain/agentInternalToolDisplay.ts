import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'

export type AgentInternalToolTone = 'neutral' | 'result' | 'process' | 'diagnostic'

export type AgentInternalToolDisplay = {
  kind: 'domainSettingsQuery' | 'domainSettingUpsert'
  title: string
  meta: Array<string | undefined | null | false>
  tone: AgentInternalToolTone
  summary: string[]
  argumentsSummary: string[]
  resultSummary: string[]
  resultDetails?: unknown
  errorDetails?: unknown
  rawDetails?: unknown
}

type ToolCallItem = Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>

type InternalToolAdapter = (item: ToolCallItem) => AgentInternalToolDisplay | null

const INTERNAL_TOOL_ADAPTERS: Record<string, InternalToolAdapter> = {
  domain_query_settings: domainQuerySettingsDisplay,
  domain_upsert_setting: domainUpsertSettingDisplay,
}

export function agentInternalToolDisplay(item: ToolCallItem): AgentInternalToolDisplay | null {
  const toolName = internalToolName(item)
  const adapter = INTERNAL_TOOL_ADAPTERS[toolName]
  return adapter ? adapter(item) : null
}

function domainQuerySettingsDisplay(item: ToolCallItem): AgentInternalToolDisplay {
  const args = recordValue(item.arguments)
  const resultRecord = item.type === 'mcpToolCall' ? recordValue(item.result) : undefined
  const errorDetails = item.type === 'mcpToolCall' ? item.error : item.error
  const settings = settingQueryResultItems(item.type === 'mcpToolCall' ? item.result : item.result)
  const settingCount = settings.length
  return {
    kind: 'domainSettingsQuery',
    title: '查询设定',
    meta: [
      item.status,
      stringValue(args?.kind),
      stringValue(args?.query ?? args?.q),
      numericLikeValue(args?.settingId ?? args?.setting_id) !== undefined ? `setting ${numericLikeValue(args?.settingId ?? args?.setting_id)}` : undefined,
      numericLikeValue(args?.limit) !== undefined ? `limit ${numericLikeValue(args?.limit)}` : undefined,
      settingCount > 0 ? `${settingCount} result(s)` : undefined,
      durationMeta(item),
    ],
    tone: internalToolTone(item),
    summary: compactStrings([
      stringValue(args?.query ?? args?.q) ? `查询：${stringValue(args?.query ?? args?.q)}` : undefined,
      stringValue(args?.kind) ? `类型：${stringValue(args?.kind)}` : undefined,
      numericLikeValue(args?.settingId ?? args?.setting_id) !== undefined ? `设定 ID：${numericLikeValue(args?.settingId ?? args?.setting_id)}` : undefined,
      settingCount > 0 ? `返回 ${settingCount} 个设定结果。` : resultRecord ? '查询完成。' : undefined,
    ]),
    argumentsSummary: compactStrings([
      stringValue(args?.query ?? args?.q) ? `query=${stringValue(args?.query ?? args?.q)}` : undefined,
      stringValue(args?.kind) ? `kind=${stringValue(args?.kind)}` : undefined,
      numericLikeValue(args?.settingId ?? args?.setting_id) !== undefined ? `settingId=${numericLikeValue(args?.settingId ?? args?.setting_id)}` : undefined,
      numericLikeValue(args?.limit) !== undefined ? `limit=${numericLikeValue(args?.limit)}` : undefined,
      stringValue(args?.projectId ?? args?.project_id) ? `projectId=${stringValue(args?.projectId ?? args?.project_id)}` : undefined,
    ]),
    resultSummary: settings.slice(0, 8).map(settingResultLabel),
    ...(resultRecord ? { resultDetails: item.type === 'mcpToolCall' ? item.result : item.result } : {}),
    ...(errorDetails !== undefined && errorDetails !== null ? { errorDetails } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

function domainUpsertSettingDisplay(item: ToolCallItem): AgentInternalToolDisplay {
  const args = recordValue(item.arguments)
  const payload = recordValue(args?.payload) ?? recordValue(args?.record) ?? recordValue(args?.entity)
  const result = item.type === 'mcpToolCall' ? item.result : item.result
  const resultRecord = recordValue(result)
  const resultSetting = recordValue(resultRecord?.record) ?? resultRecord
  const errorDetails = item.type === 'mcpToolCall' ? item.error : item.error
  const title = settingTitle(resultSetting) ?? settingTitle(payload) ?? 'Untitled setting'
  const kind = settingKind(resultSetting) ?? settingKind(payload)
  const path = settingPath(resultSetting) ?? settingPath(resultRecord) ?? settingPath(recordValue(args?.record)) ?? settingPath(recordValue(args?.entity))
  const id = settingId(resultSetting) ?? settingId(payload)
  return {
    kind: 'domainSettingUpsert',
    title: '写入设定',
    meta: [
      item.status,
      kind,
      id ? `setting ${id}` : undefined,
      path,
      durationMeta(item),
    ],
    tone: internalToolTone(item),
    summary: compactStrings([
      `设定：${title}`,
      kind ? `类型：${kind}` : undefined,
      id ? `ID：${id}` : undefined,
      path ? `路径：${path}` : undefined,
      resultRecord ? '设定已写入本地工作区，尚需后续 review/build 才会成为当前生效数据。' : undefined,
    ]),
    argumentsSummary: compactStrings([
      settingTitle(payload) ? `title=${settingTitle(payload)}` : undefined,
      settingKind(payload) ? `kind=${settingKind(payload)}` : undefined,
      settingId(payload) ? `id=${settingId(payload)}` : undefined,
      stringValue(args?.projectId ?? args?.project_id) ? `projectId=${stringValue(args?.projectId ?? args?.project_id)}` : undefined,
    ]),
    resultSummary: compactStrings([
      path ? `1. ${title}${kind ? ` - ${kind}` : ''} - ${path}` : undefined,
    ]),
    ...(resultRecord ? { resultDetails: result } : {}),
    ...(errorDetails !== undefined && errorDetails !== null ? { errorDetails } : {}),
    ...(item.raw !== undefined ? { rawDetails: item.raw } : {}),
  }
}

function internalToolName(item: ToolCallItem): string {
  return item.tool
}

function internalToolTone(item: ToolCallItem): AgentInternalToolTone {
  if ((item.type === 'mcpToolCall' && item.error) || (item.type === 'dynamicToolCall' && item.error !== undefined)) return 'diagnostic'
  if (item.status && /fail|failed|error|cancel|cancelled|rejected|denied/i.test(item.status)) return 'diagnostic'
  if (item.status === 'completed' || (item.type === 'dynamicToolCall' && item.success === true)) return 'result'
  return 'process'
}

function settingQueryResultItems(result: unknown): Record<string, unknown>[] {
  const record = recordValue(result)
  const candidates = [
    record?.settings,
    record?.entities,
    record?.items,
    record?.data,
    record?.results,
    result,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(recordValue)
  }
  return []
}

function settingResultLabel(setting: Record<string, unknown>, index: number): string {
  const title = settingTitle(setting)
    ?? `setting ${index + 1}`
  const kind = settingKind(setting)
  const path = settingPath(setting)
  return compactStrings([
    `${index + 1}. ${title}`,
    kind,
    path,
  ]).join(' - ')
}

function settingTitle(setting: Record<string, unknown> | undefined): string | undefined {
  return stringValue(setting?.title)
    ?? stringValue(setting?.name)
    ?? stringValue(setting?.display_name)
    ?? stringValue(setting?.label)
    ?? stringValue(setting?.id)
}

function settingKind(setting: Record<string, unknown> | undefined): string | undefined {
  return stringValue(setting?.setting_kind)
    ?? stringValue(setting?.settingKind)
    ?? stringValue(setting?.kind)
}

function settingId(setting: Record<string, unknown> | undefined): string | undefined {
  return stringValue(setting?.id)
    ?? stringValue(setting?.setting_id)
    ?? stringValue(setting?.settingId)
}

function settingPath(setting: Record<string, unknown> | undefined): string | undefined {
  return stringValue(setting?.path)
    ?? stringValue(setting?.workspace_path)
    ?? stringValue(setting?.__workspace_path)
}

function durationMeta(item: ToolCallItem): string | undefined {
  return item.durationMs !== undefined && item.durationMs !== null ? `${item.durationMs}ms` : undefined
}

function compactStrings(values: Array<string | undefined | null | false>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numericLikeValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}
