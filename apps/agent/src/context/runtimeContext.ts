import type { JSONValue } from '../types.js'
import { isRecord } from '../jsonValue.js'

export interface AgentContext {
  currentProjectId?: number
  currentProductionId?: number
}

export function isValidAgentEntityId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isValidAgentProjectId(value: unknown): value is number {
  return isValidAgentEntityId(value)
}

export function isValidAgentReferenceId(value: unknown): value is number | string {
  return isValidAgentEntityId(value) || (typeof value === 'string' && value.trim().length > 0)
}

export function extractAgentContext(result: JSONValue): AgentContext {
  return {
    currentProjectId: extractCurrentProjectId(result),
    currentProductionId: extractCurrentProductionId(result),
  }
}

export function extractCurrentProjectId(result: JSONValue): number | undefined {
  const parsed = parseToolResult(result)
  if (!isRecord(parsed)) return undefined

  const snapshot = isRecord(parsed.focus) ? parsed.focus : isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = project?.id ?? project?.ID ?? snapshot.projectId ?? snapshot.currentProjectId
  return isValidAgentProjectId(projectId) ? projectId : undefined
}

export function extractCurrentProductionId(result: JSONValue): number | undefined {
  const parsed = parseToolResult(result)
  if (!isRecord(parsed)) return undefined

  const snapshot = isRecord(parsed.focus) ? parsed.focus : isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const productionId = snapshot.productionId ?? snapshot.currentProductionId
  return isValidAgentEntityId(productionId) ? productionId : undefined
}

export function extractFocusTimings(result: JSONValue): { totalMs?: number; focusMs?: number } | undefined {
  const parsed = parseToolResult(result)
  if (!isRecord(parsed) || !isRecord(parsed.timings)) return undefined
  const timings = parsed.timings
  const output: { totalMs?: number; focusMs?: number } = {}
  if (typeof timings.totalMs === 'number' && Number.isFinite(timings.totalMs)) output.totalMs = timings.totalMs
  if (typeof timings.focusMs === 'number' && Number.isFinite(timings.focusMs)) {
    output.focusMs = timings.focusMs
  } else if (output.totalMs !== undefined) {
    output.focusMs = output.totalMs
  }
  return Object.keys(output).length > 0 ? output : undefined
}

export function parseToolResult(result: JSONValue): unknown {
  if (!isRecord(result)) return result
  if (result.data !== undefined) return result.data
  const content = result.content
  if (!Array.isArray(content)) return result
  const first = content[0]
  if (!isRecord(first) || typeof first.text !== 'string') return result
  try {
    return JSON.parse(first.text)
  } catch {
    return first.text
  }
}
