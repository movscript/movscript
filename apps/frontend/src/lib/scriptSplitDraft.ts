import { localAgentClient, type AgentDraft, type AgentDraftValidationResult } from '@/lib/localAgentClient'
import { isRecord } from '@/lib/jsonValue'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import type { Script } from '@/types'

export const SCRIPT_SPLIT_DRAFT_SCHEMA = DRAFT_CONTENT_SCHEMA_IDS.scriptSplit

export interface ScriptSplitDraft {
  id: string
  order: number
  title: string
  summary: string
  content: string
  bodyContent: string
  globalContextText: string
  globalContext: ScriptSplitGlobalContext
  startLine: number
  endLine: number
  existingScriptId: number | null
  action: 'create' | 'update'
  productionAction: 'create' | 'update' | 'skip'
  existingProductionId: number | null
  productionTitle: string
  productionSummary: string
}

export interface ScriptTextLineEntry {
  lineNo: number
  text: string
}

export interface ScriptSplitResult {
  sourceTitle: string
  sourceScriptId: number | null
  createdCount: number
  updatedCount: number
  episodeCount: number
  productionCreatedCount?: number
  productionUpdatedCount?: number
  productionSkippedCount?: number
  agentRunId?: string
  agentDraftId?: string
  savedScripts?: Script[]
}

export interface ScriptSplitAgentEpisode {
  order?: unknown
  title?: unknown
  summary?: unknown
  content?: unknown
  global_context?: unknown
  globalContext?: unknown
  start_line?: unknown
  startLine?: unknown
  end_line?: unknown
  endLine?: unknown
  start?: unknown
  end?: unknown
  action?: unknown
  existing_script_id?: unknown
  existingScriptId?: unknown
  production_action?: unknown
  productionAction?: unknown
  existing_production_id?: unknown
  existingProductionId?: unknown
  production_title?: unknown
  productionTitle?: unknown
  production_summary?: unknown
  productionSummary?: unknown
}

export interface ScriptSplitProductionSummary {
  ID: number
  name?: string
  title?: string
  description?: string
  status?: string
  source_type?: string
  script_version_id?: number
  preview_timeline_id?: number
  metadata_json?: string
}

export interface ScriptSplitGlobalContext {
  storyWorld: string
  coreRules: string[]
  characterRelationships: string[]
  keyCharacters: string[]
  keyLocations: string[]
  keyProps: string[]
  continuityNotes: string[]
  episodeRelevance: string[]
}

export interface ScriptSplitAgentResult {
  schema?: unknown
  source_title?: unknown
  sourceTitle?: unknown
  source_summary?: unknown
  sourceSummary?: unknown
  source_script?: {
    title?: unknown
    summary?: unknown
    content?: unknown
    sourceType?: unknown
    source_type?: unknown
    line_count?: unknown
    lineCount?: unknown
  }
  global_settings?: unknown
  globalSettings?: unknown
  episode_drafts?: unknown
  episodes?: unknown
  warnings?: unknown
  confidence?: unknown
}

interface ParsedEpisodeHeading {
  order: number
  title: string
  seriesTitle?: string
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n|[；;]/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  }
  return []
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function lineNumberValue(value: unknown): number | undefined {
  const number = numberValue(value)
  if (number === undefined) return undefined
  const line = Math.floor(number)
  return line > 0 ? line : undefined
}

export function normalizeScriptType(value?: string) {
  const type = String(value ?? '').trim().toLowerCase()
  if (!type || type === 'uncategorized' || type === 'main' || type === 'source' || type === 'raw') return 'main'
  if (type === 'episode' || type === 'episodes' || type === 'ep') return 'episode'
  return type
}

export function scriptTypeLabel(value?: string) {
  const type = normalizeScriptType(value)
  if (type === 'main') return '总稿'
  if (type === 'episode') return '制作'
  return type || '未分类'
}

export function inferSourceScriptTitle(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const episodeHeading = lines.map(parseEpisodeHeading).find(Boolean)
  if (episodeHeading?.seriesTitle) return `${episodeHeading.seriesTitle} 总稿`

  const firstNonEpisodeLine = lines.find((line) => !parseEpisodeHeading(line))
  if (!firstNonEpisodeLine) return '剧本总稿'

  const cleaned = firstNonEpisodeLine
    .replace(/^#{1,6}\s*/, '')
    .replace(/^《(.+?)》\s*/, '$1 ')
    .replace(/^【\s*/, '')
    .replace(/\s*】$/, '')
    .trim()

  return summarizeText(cleaned || '剧本总稿', 32)
}

function parseEpisodeHeading(line: string): ParsedEpisodeHeading | null {
  const normalized = line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[>*\-•]\s*/, '')
    .replace(/^【\s*/, '')
    .replace(/\s*】$/, '')
    .trim()

  const cnMatch = normalized.match(/^(?:《([^》]+)》\s*)?第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回](?:\s*[：:\-—]\s*(.+)|\s+(.+))?$/)
  if (cnMatch) {
    const order = parseEpisodeNumber(cnMatch[2])
    if (!order) return null
    const subtitle = firstText(cnMatch[3], cnMatch[4])
    const label = `第${order}集`
    return {
      order,
      title: subtitle ? `${label} ${subtitle}` : label,
      seriesTitle: cnMatch[1]?.trim(),
    }
  }

  const epMatch = normalized.match(/^(?:《([^》]+)》\s*)?(?:EP|E|Episode)\s*0*([0-9]+)(?:\s*[：:\-—]\s*(.+)|\s+(.+))?$/i)
  if (epMatch) {
    const order = Number(epMatch[2])
    if (!Number.isFinite(order) || order <= 0) return null
    const subtitle = firstText(epMatch[3], epMatch[4])
    const label = `EP${String(order).padStart(2, '0')}`
    return {
      order,
      title: subtitle ? `${label} ${subtitle}` : label,
      seriesTitle: epMatch[1]?.trim(),
    }
  }

  return null
}

function parseEpisodeNumber(value: string) {
  const token = String(value ?? '').trim()
  if (/^\d+$/.test(token)) return Number(token)

  const digitMap: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  const unitMap: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0
  let section = 0
  let number = 0

  for (const char of token) {
    if (char in digitMap) {
      number = digitMap[char]
      continue
    }
    const unit = unitMap[char]
    if (!unit) continue
    if (unit === 10000) {
      total += (section + number) * unit
      section = 0
      number = 0
      continue
    }
    section += (number || 1) * unit
    number = 0
  }

  return total + section + number
}

function inferEpisodeTitle(content: string, index: number) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  const heading = firstLine ? parseEpisodeHeading(firstLine) : null
  if (heading) return heading.title
  const fallback = firstLine ? summarizeText(firstLine.replace(/^#{1,6}\s*/, ''), 24) : ''
  return fallback ? `第${index + 1}集 ${fallback}` : `第${index + 1}集`
}

export function findMatchingScript(scripts: Script[], title: string, scriptType: string, parentScriptId?: number | null) {
  const titleKey = normalizeScriptTitleKey(title)
  const type = normalizeScriptType(scriptType)
  return scripts.find((script) => {
    if (normalizeScriptTitleKey(script.title) !== titleKey) return false
    if (normalizeScriptType(script.script_type) !== type) return false
    if (parentScriptId === undefined) return true
    return Number(script.parent_script_id ?? 0) === Number(parentScriptId ?? 0)
  }) ?? null
}

export function findScriptByIdAndType(scripts: Script[], scriptId: number | null | undefined, scriptType: string) {
  if (!scriptId) return null
  const type = normalizeScriptType(scriptType)
  return scripts.find((script) => script.ID === scriptId && normalizeScriptType(script.script_type) === type) ?? null
}

function findMatchingProductionById(productions: ScriptSplitProductionSummary[], productionId: number) {
  return productions.find((production) => production.ID === productionId) ?? null
}

function findMatchingProduction(productions: ScriptSplitProductionSummary[], title: string) {
  const titleKey = normalizeScriptTitleKey(title)
  return productions.find((production) => normalizeScriptTitleKey(firstText(production.name, production.title)) === titleKey) ?? null
}

function normalizeScriptTitleKey(value: string) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase()
}

export function summarizeText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(1, maxLength - 3))}...`
}

function firstText(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

export function parseScriptSplitDraftDocument(content: string): ScriptSplitAgentResult {
  const parsed = parseJSONFromDraftContent(content) as ScriptSplitAgentResult | undefined
  if (!parsed || typeof parsed !== 'object') throw new Error('草稿没有返回有效 JSON')
  if (parsed.schema !== SCRIPT_SPLIT_DRAFT_SCHEMA) throw new Error('草稿 schema 不匹配')
  return parsed
}

export function parseScriptSplitDraftContent(
  content: string,
  scripts: Script[],
  fallbackText: string,
  productions: ScriptSplitProductionSummary[] = [],
): ScriptSplitDraft[] {
  const parsed = parseScriptSplitDraftDocument(content)
  const globalSettings = normalizeGlobalContext(parsed.global_settings ?? parsed.globalSettings)
  const rawEpisodes = Array.isArray(parsed.episode_drafts)
    ? parsed.episode_drafts
    : Array.isArray(parsed.episodes)
      ? parsed.episodes
      : []
  const drafts = rawEpisodes.flatMap((episode, index) => normalizeAgentEpisodeDraft(
    episode as ScriptSplitAgentEpisode,
    index,
    scripts,
    productions,
    fallbackText,
    globalSettings,
  ))
  if (drafts.length === 0) throw new Error('草稿没有可写入的制作内容')
  return drafts
}

function parseJSONFromDraftContent(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) return JSON.parse(fenced[1])
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
    throw new Error('无法解析草稿 JSON 输出')
  }
}

function normalizeAgentEpisodeDraft(
  episode: ScriptSplitAgentEpisode,
  index: number,
  scripts: Script[],
  productions: ScriptSplitProductionSummary[],
  fallbackText: string,
  globalSettings: ScriptSplitGlobalContext,
): ScriptSplitDraft[] {
  if (!episode || typeof episode !== 'object') return []
  const startLine = determineEpisodeStartLine(episode, index + 1)
  const endLine = determineEpisodeEndLine(episode, startLine)
  const rawContent = stringValue(episode.content).trim() || getScriptSplitEpisodeBodyFromSourceText(fallbackText, startLine, endLine)
  if (!rawContent) return []
  const globalContext = mergeGlobalContext(globalSettings, normalizeGlobalContext(episode.global_context ?? episode.globalContext))
  const globalContextText = formatGlobalContextForEpisode(globalContext)
  const content = withGlobalContextSection(rawContent, globalContextText)
  const title = stringValue(episode.title).trim() || inferEpisodeTitle(rawContent, index)
  const existingId = numberValue(episode.existing_script_id ?? episode.existingScriptId)
  const existing = existingId
    ? findScriptByIdAndType(scripts, existingId, 'episode') ?? findMatchingScript(scripts, title, 'episode')
    : findMatchingScript(scripts, title, 'episode')
  const productionTitle = stringValue(episode.production_title ?? episode.productionTitle).trim() || title
  const explicitProductionId = numberValue(episode.existing_production_id ?? episode.existingProductionId)
  const matchedProduction = explicitProductionId
    ? findMatchingProductionById(productions, explicitProductionId) ?? findMatchingProduction(productions, productionTitle)
    : findMatchingProduction(productions, productionTitle)
  const productionAction = normalizeProductionAction(
    episode.production_action ?? episode.productionAction,
    'create',
    matchedProduction,
  )
  const resolvedProductionAction = productionAction === 'skip'
    ? 'skip'
    : (productionAction === 'update' || matchedProduction ? 'update' : 'create')
  const productionSummary = stringValue(episode.production_summary ?? episode.productionSummary).trim() || summarizeText(rawContent, 120)
  const action = episode.action === 'update' || existing ? 'update' : 'create'
  return [{
    id: `agent-episode-${numberValue(episode.order) ?? index + 1}-${index}`,
    order: numberValue(episode.order) ?? index + 1,
    title,
    summary: stringValue(episode.summary).trim() || summarizeText(rawContent, 120),
    content,
    bodyContent: rawContent,
    globalContextText,
    globalContext,
    startLine,
    endLine,
    existingScriptId: existing?.ID ?? null,
    action,
    productionAction: resolvedProductionAction,
    existingProductionId: matchedProduction?.ID ?? explicitProductionId ?? null,
    productionTitle,
    productionSummary,
  }]
}

export function buildScriptSplitDraftContent(input: {
  agentDraft?: AgentDraft | null
  drafts: ScriptSplitDraft[]
  sourceTitle: string
  sourceText: string
}): string {
  let base: ScriptSplitAgentResult = { schema: SCRIPT_SPLIT_DRAFT_SCHEMA }
  if (input.agentDraft?.content) {
    try {
      base = parseScriptSplitDraftDocument(input.agentDraft.content)
    } catch {
      base = { schema: SCRIPT_SPLIT_DRAFT_SCHEMA }
    }
  }
  const globalContext = input.drafts.reduce<ScriptSplitGlobalContext | null>((merged, draft) => {
    if (!merged) return { ...draft.globalContext, episodeRelevance: [] }
    return { ...mergeGlobalContext(merged, draft.globalContext), episodeRelevance: [] }
  }, null)
  const nextDocument = {
    ...base,
    schema: SCRIPT_SPLIT_DRAFT_SCHEMA,
    source_title: stringValue(base.source_title ?? base.sourceTitle).trim() || input.sourceTitle,
    source_summary: stringValue(base.source_summary ?? base.sourceSummary).trim() || summarizeText(input.sourceText, 160),
    source_script: {
      title: stringValue(base.source_script?.title).trim() || input.sourceTitle,
      summary: stringValue(base.source_script?.summary).trim() || summarizeText(input.sourceText, 160),
      source_type: normalizeSourceType(base.source_script?.sourceType ?? base.source_script?.source_type),
      line_count: lineCountForText(input.sourceText),
    },
    global_settings: isRecord(base.global_settings)
      ? base.global_settings
      : serializeGlobalContext(globalContext ?? normalizeGlobalContext(undefined), false),
    episode_drafts: input.drafts.map((draft) => serializeScriptSplitEpisodeDraft(draft, input.sourceText)),
  }
  return JSON.stringify(nextDocument, null, 2)
}

function serializeScriptSplitEpisodeDraft(draft: ScriptSplitDraft, sourceText: string): Record<string, unknown> {
  const sourceBody = getScriptSplitEpisodeBodyFromSourceText(sourceText, draft.startLine, draft.endLine)
  const payload: Record<string, unknown> = {
    order: draft.order,
    title: draft.title,
    summary: draft.summary,
    global_context: serializeGlobalContext(draft.globalContext, true),
    start_line: draft.startLine,
    end_line: draft.endLine,
    action: draft.action,
    existing_script_id: draft.existingScriptId,
    production_action: draft.productionAction,
    existing_production_id: draft.existingProductionId,
    production_title: draft.productionTitle,
    production_summary: draft.productionSummary,
  }
  if (normalizeWhitespace(draft.bodyContent) && normalizeWhitespace(draft.bodyContent) !== normalizeWhitespace(sourceBody)) {
    payload.content = draft.bodyContent.trim()
  }
  return payload
}

function serializeGlobalContext(context: ScriptSplitGlobalContext, includeEpisodeRelevance: boolean): Record<string, unknown> {
  return {
    story_world: context.storyWorld,
    core_rules: context.coreRules,
    character_relationships: context.characterRelationships,
    key_characters: context.keyCharacters,
    key_locations: context.keyLocations,
    key_props: context.keyProps,
    continuity_notes: context.continuityNotes,
    ...(includeEpisodeRelevance ? { episode_relevance: context.episodeRelevance } : {}),
  }
}

export function scriptSplitDraftStatusLabel(status?: AgentDraft['status']) {
  if (status === 'draft') return '待确认'
  if (status === 'accepted') return '已接受'
  if (status === 'rejected') return '已删除'
  if (status === 'applied') return '已写入'
  if (status === 'superseded') return '已替换'
  return '未生成'
}

export function scriptSplitDraftStatusVariant(status?: AgentDraft['status']) {
  if (status === 'applied') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'superseded') return 'secondary' as const
  if (status === 'accepted') return 'warning' as const
  if (status === 'draft') return 'outline' as const
  return 'outline' as const
}

export function normalizeGlobalContext(value: unknown): ScriptSplitGlobalContext {
  const record = isRecord(value) ? value : {}
  return {
    storyWorld: stringValue(record.story_world ?? record.storyWorld).trim(),
    coreRules: stringArrayValue(record.core_rules ?? record.coreRules),
    characterRelationships: stringArrayValue(record.character_relationships ?? record.characterRelationships),
    keyCharacters: stringArrayValue(record.key_characters ?? record.keyCharacters),
    keyLocations: stringArrayValue(record.key_locations ?? record.keyLocations),
    keyProps: stringArrayValue(record.key_props ?? record.keyProps),
    continuityNotes: stringArrayValue(record.continuity_notes ?? record.continuityNotes),
    episodeRelevance: stringArrayValue(record.episode_relevance ?? record.episodeRelevance),
  }
}

function mergeGlobalContext(base: ScriptSplitGlobalContext, episode: ScriptSplitGlobalContext): ScriptSplitGlobalContext {
  return {
    storyWorld: episode.storyWorld || base.storyWorld,
    coreRules: mergeStringArrays(base.coreRules, episode.coreRules),
    characterRelationships: mergeStringArrays(base.characterRelationships, episode.characterRelationships),
    keyCharacters: mergeStringArrays(base.keyCharacters, episode.keyCharacters),
    keyLocations: mergeStringArrays(base.keyLocations, episode.keyLocations),
    keyProps: mergeStringArrays(base.keyProps, episode.keyProps),
    continuityNotes: mergeStringArrays(base.continuityNotes, episode.continuityNotes),
    episodeRelevance: episode.episodeRelevance,
  }
}

function mergeStringArrays(...groups: string[][]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const group of groups) {
    for (const item of group) {
      const key = item.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}

function formatGlobalContextForEpisode(context: ScriptSplitGlobalContext): string {
  const lines: string[] = []
  const appendList = (label: string, values: string[]) => {
    if (values.length === 0) return
    lines.push(`${label}:`)
    values.forEach((value) => lines.push(`- ${value}`))
  }
  if (context.storyWorld) lines.push(`故事世界: ${context.storyWorld}`)
  appendList('核心规则', context.coreRules)
  appendList('人物关系', context.characterRelationships)
  appendList('关键人物', context.keyCharacters)
  appendList('关键场景', context.keyLocations)
  appendList('关键道具', context.keyProps)
  appendList('连续性约束', context.continuityNotes)
  appendList('本集相关性', context.episodeRelevance)
  return lines.join('\n').trim()
}

function withGlobalContextSection(content: string, globalContextText: string): string {
  const trimmed = content.trim()
  if (!globalContextText) return trimmed
  if (/^#{0,6}\s*全局设定上下文\b/m.test(trimmed) || /^【全局设定上下文】/m.test(trimmed)) return trimmed
  return ['【全局设定上下文】', globalContextText, '', '【本集正文】', trimmed].join('\n')
}

function splitScriptLines(text: string): string[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n')
  return normalized.length > 0 ? normalized.split('\n') : []
}

export function getScriptTextLineEntries(text: string): ScriptTextLineEntry[] {
  return splitScriptLines(text).map((line, index) => ({
    lineNo: index + 1,
    text: line,
  }))
}

export function getScriptTextLineCount(text: string): number {
  return lineCountForText(text)
}

function lineCountForText(text: string): number {
  const normalized = String(text ?? '')
  if (!normalized) return 0
  return splitScriptLines(normalized).length
}

function getScriptSplitEpisodeBodyFromSourceText(text: string, startLine: number, endLine: number): string {
  const lines = splitScriptLines(text)
  if (lines.length === 0) return ''
  const startIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(startLine) - 1))
  const endIndex = Math.max(startIndex, Math.min(lines.length - 1, Math.floor(endLine) - 1))
  return lines.slice(startIndex, endIndex + 1).join('\n').trim()
}

function determineEpisodeStartLine(episode: ScriptSplitAgentEpisode, fallbackStartLine = 1): number {
  return lineNumberValue(episode.startLine ?? episode.start_line ?? episode.start) ?? fallbackStartLine
}

function determineEpisodeEndLine(episode: ScriptSplitAgentEpisode, startLine: number): number {
  const explicit = lineNumberValue(episode.endLine ?? episode.end_line ?? episode.end)
  if (explicit !== undefined) return explicit
  const explicitContent = stringValue(episode.content).trim()
  if (explicitContent) return Math.max(startLine, startLine + splitScriptLines(explicitContent).length - 1)
  return startLine
}

function normalizeSourceType(value: unknown): string {
  const type = String(value ?? '').trim().toLowerCase()
  if (type === 'raw' || type === 'adapted' || type === 'revised') return type
  return 'raw'
}

function normalizeProductionAction(
  value: unknown,
  fallback: 'create' | 'update',
  matchedProduction?: ScriptSplitProductionSummary | null,
): 'create' | 'update' | 'skip' {
  const type = String(value ?? '').trim().toLowerCase()
  if (type === 'create' || type === 'update' || type === 'skip') return type
  if (matchedProduction) return 'update'
  return fallback
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
