import type { JSONValue, ToolCall } from '../state/types.js'

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

export function normalizeApprovedToolNames(value: unknown): string[] {
  return normalizeStringArray(value)
}

export function normalizeToolCall(value: unknown): ToolCall | undefined {
  if (!isRecord(value)) return undefined
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined
  if (!name) return undefined
  return { name, ...(isRecord(value.args) ? { args: value.args as Record<string, JSONValue> } : {}) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
