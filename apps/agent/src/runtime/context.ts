import type { JSONValue } from '../types.js'

export interface AgentContext {
  currentProjectId?: number
  currentProductionId?: number
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

  const snapshot = isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = project?.id ?? project?.ID ?? snapshot.projectId ?? snapshot.currentProjectId
  return typeof projectId === 'number' && Number.isFinite(projectId) ? projectId : undefined
}

export function extractCurrentProductionId(result: JSONValue): number | undefined {
  const parsed = parseToolResult(result)
  if (!isRecord(parsed)) return undefined

  const snapshot = isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const productionId = snapshot.productionId ?? snapshot.currentProductionId
  return typeof productionId === 'number' && Number.isFinite(productionId) ? productionId : undefined
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
