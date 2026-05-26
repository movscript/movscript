import type {
  ReadonlyScriptFile,
  ScriptFileRangePayload,
  ScriptLineRange,
} from './types'
import { clampNumber, numericValue } from './utils'
import { scriptLinesText } from './scriptScenes'

export function readonlyScriptFileURI(projectId: number, scriptVersionId: number): string {
  return `movscript://project/${projectId}/script-version/${scriptVersionId}/content`
}

export function readonlyScriptFileRangeURI(uri: string, startLine: number, endLine: number): string {
  const parsed = new URL(uri)
  parsed.searchParams.set('startLine', String(startLine))
  parsed.searchParams.set('endLine', String(endLine))
  return parsed.toString()
}

export function parseScriptFileURI(uri: string): ({ projectId: number; scriptVersionId: number } & Partial<ScriptLineRange> & { lineCount?: number }) | null {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return null
  }
  if (parsed.protocol !== 'movscript:' || parsed.hostname !== 'project') return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 4 || parts[1] !== 'script-version' || parts[3] !== 'content') return null
  const projectId = numericValue(parts[0])
  const scriptVersionId = numericValue(parts[2])
  if (!projectId || !scriptVersionId) return null
  return {
    projectId,
    scriptVersionId,
    startLine: numericValue(parsed.searchParams.get('startLine')),
    endLine: numericValue(parsed.searchParams.get('endLine')),
    lineCount: numericValue(parsed.searchParams.get('lineCount')),
    maxChars: numericValue(parsed.searchParams.get('maxChars')),
  }
}

export function normalizeScriptLineRange(totalLines: number, input: { startLine?: number; endLine?: number; lineCount?: number; maxChars?: number }): ScriptLineRange {
  const safeTotal = Math.max(1, totalLines)
  const startLine = clampNumber(Math.floor(input.startLine ?? 1), 1, safeTotal)
  const lineCount = clampNumber(Math.floor(input.lineCount ?? 80), 1, 1000)
  const endLine = clampNumber(Math.floor(input.endLine ?? (startLine + lineCount - 1)), startLine, safeTotal)
  const maxChars = clampNumber(Math.floor(input.maxChars ?? 20000), 500, 100000)
  return { startLine, endLine, maxChars }
}

export function scriptFileRangePayload(file: ReadonlyScriptFile, range: ScriptLineRange): ScriptFileRangePayload {
  const fullText = scriptLinesText(file.lines, range.startLine, range.endLine)
  const truncated = fullText.length > range.maxChars
  return {
    projectId: file.projectId,
    scriptVersionId: file.scriptVersionId,
    scriptId: file.scriptId,
    title: file.title,
    uri: file.uri,
    startLine: range.startLine,
    endLine: range.endLine,
    lineCount: Math.max(0, range.endLine - range.startLine + 1),
    totalLines: file.lines.length,
    text: truncated ? fullText.slice(0, range.maxChars) : fullText,
    truncated,
  }
}
