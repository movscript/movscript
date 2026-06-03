import type { MCPJSONValue, MCPTool } from '../types'

export interface MCPPluginTool extends MCPTool {
  pluginId: string
}

let pluginTools: MCPPluginTool[] = []

export function updateMCPPluginTools(next: MCPPluginTool[]): void {
  const byName = new Map<string, MCPPluginTool>()
  for (const tool of next) {
    if (!tool.pluginId || !tool.name || !tool.description || !tool.inputSchema) continue
    byName.set(tool.name, tool)
  }
  pluginTools = Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name))
}

export function listMCPPluginTools(): MCPPluginTool[] {
  return pluginTools
}

export function findMCPPluginTool(name: string): MCPPluginTool | undefined {
  return pluginTools.find((tool) => tool.name === name)
}

export function toMCPPluginTool(value: unknown): MCPPluginTool | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  if (typeof item.pluginId !== 'string' || !item.pluginId.trim()) return undefined
  if (typeof item.name !== 'string' || !item.name.trim()) return undefined
  if (typeof item.description !== 'string' || !item.description.trim()) return undefined
  if (!isMCPObjectSchema(item.inputSchema)) return undefined
  return {
    pluginId: item.pluginId.trim(),
    name: item.name.trim(),
    description: item.description.trim(),
    inputSchema: item.inputSchema,
    ...(isMCPObjectSchema(item.outputSchema) ? { outputSchema: item.outputSchema } : {}),
  }
}

function isMCPObjectSchema(value: unknown): value is MCPPluginTool['inputSchema'] {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === 'object'
    && isMCPJSONValue((value as { properties?: unknown }).properties)
  )
}

function isMCPJSONValue(value: unknown): value is MCPJSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isMCPJSONValue)
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every(isMCPJSONValue)
}
