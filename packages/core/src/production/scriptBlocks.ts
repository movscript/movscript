export type ProductionScriptVersionLike = {
  ID: number
  content?: string
  raw_source?: string
  [key: string]: unknown
}

export type ProductionScriptBlockKind = 'dialogue' | 'scene_heading' | 'action'

export type ScriptLineEntry = {
  number: number
  content: string
}

export interface InferredScriptBlockKind {
  kind: ProductionScriptBlockKind
  speaker: string
}

export function scriptSourceTextForVersion(version: ProductionScriptVersionLike | null) {
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

export function inferScriptBlockKind(text: string): InferredScriptBlockKind {
  const firstLine = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  const speakerMatch = firstLine.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
  if (speakerMatch) return { kind: 'dialogue', speaker: speakerMatch[1].trim() }
  if (/^(INT\.|EXT\.|内景|外景|场景|第.+场)/i.test(firstLine)) return { kind: 'scene_heading', speaker: '' }
  return { kind: 'action', speaker: '' }
}
