import type { ScriptVersion } from '@/api/scriptVersions'

export type ProductionScriptBlockRecord = {
  ID: number
  start_line?: unknown
  end_line?: unknown
  content?: unknown
  summary?: unknown
  title?: unknown
  speaker?: unknown
}

export type ScriptLineEntry = {
  number: number
  content: string
}

export function scriptVersionOptionLabel(version: ScriptVersion) {
  return version.title || `剧本 #${version.ID}`
}

export function scriptSourceTextForVersion(version: ScriptVersion | null) {
  if (!version) return ''
  return normalizeScriptSourceText(version.content || version.raw_source || '')
}

export function normalizeScriptSourceText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function scriptLineEntries(scriptSourceText: string): ScriptLineEntry[] {
  const lines = normalizeScriptSourceText(scriptSourceText).split('\n')
  if (lines.length === 1 && lines[0] === '') return []
  return lines.map((content, index) => ({ number: index + 1, content }))
}

export function scriptBlockContentFromLines(scriptSourceText: string, startLine: number, endLine: number) {
  return scriptLineEntries(scriptSourceText)
    .filter((line) => line.number >= startLine && line.number <= endLine)
    .map((line) => line.content)
    .join('\n')
}

export function inferScriptBlockKind(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const speakerMatch = firstLine.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
  if (speakerMatch) return { kind: 'dialogue', speaker: speakerMatch[1].trim() }
  if (/^(INT\.|EXT\.|内景|外景|场景|第.+场)/i.test(firstLine)) return { kind: 'scene_heading', speaker: '' }
  return { kind: 'action', speaker: '' }
}

export function scriptBlockLineLabel(block: ProductionScriptBlockRecord) {
  const startLine = Number(block.start_line)
  const endLine = Number(block.end_line)
  if (Number.isFinite(startLine) && startLine > 0 && Number.isFinite(endLine) && endLine > 0) return `行 ${startLine}-${endLine}`
  if (Number.isFinite(startLine) && startLine > 0) return `行 ${startLine}`
  return `剧本块 #${block.ID}`
}

export function scriptBlockSelectLabel(block: ProductionScriptBlockRecord) {
  const source = scriptBlockLineLabel(block)
  const text = summarizeScriptText(firstScriptText(block.content, block.summary, block.title), 18)
  const speaker = firstScriptText(block.speaker)
  return [source, speaker, text].filter(Boolean).join(' · ')
}

export function firstScriptText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function summarizeScriptText(value: unknown, limit = 28) {
  const text = firstScriptText(value).replace(/\s+/g, ' ')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export function formatVersionUpdatedAt(value?: string) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
