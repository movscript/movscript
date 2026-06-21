import type { AgentChatThreadItem } from '@movscript/core/agent/chat'
import { rememberTouchedLocalProject } from '@/shared/infrastructure/session/localProjectRecentsStore'

type McpToolCallItem = Extract<AgentChatThreadItem, { type: 'mcpToolCall' }>

const MCP_PROJECT_RECENT_TOOLS = new Set([
  'movscript_project_init',
  'movscript_project_open',
  'movscript_project_fetch',
  'system_project_init',
  'system_project_open',
  'system_project_fetch',
])
const rememberedMcpProjectRecentKeys = new Set<string>()
const REMEMBERED_MCP_PROJECT_RECENT_KEY_LIMIT = 500

export function rememberMcpProjectToolRecent(item: Extract<AgentChatThreadItem, { type: 'mcpToolCall' | 'dynamicToolCall' }>): boolean {
  if (item.type !== 'mcpToolCall') return false
  const touch = localProjectTouchFromMcpToolCall(item)
  if (!touch) return false
  const key = `${item.id}:${item.tool}:${touch.projectDir}`
  if (rememberedMcpProjectRecentKeys.has(key)) return false
  rememberMcpProjectRecentKey(key)
  rememberTouchedLocalProject(touch)
  return true
}

export function localProjectTouchFromMcpToolCall(item: McpToolCallItem): Parameters<typeof rememberTouchedLocalProject>[0] | null {
  if (!MCP_PROJECT_RECENT_TOOLS.has(item.tool)) return null
  if (item.error !== undefined && item.error !== null) return null
  const payload = mcpResultPayload(item.result)
  const projectDir = stringField(payload, 'projectDir')
    ?? stringField(payload, 'projectPath')
    ?? stringField(payload, 'workspacePath')
    ?? stringField(payload, 'workspace_path')
    ?? stringField(recordField(payload, 'locator'), 'projectDir')
    ?? stringField(recordField(payload, 'project'), 'projectDir')
    ?? stringField(recordField(payload, 'project'), 'projectPath')
    ?? stringField(recordField(payload, 'project'), 'workspacePath')
    ?? stringField(recordField(payload, 'project'), 'workspace_path')
  if (!projectDir) return null
  const project = recordField(payload, 'project')
  return {
    projectDir,
    name: stringField(project, 'name') ?? stringField(project, 'title') ?? stringField(payload, 'title'),
    description: stringField(project, 'description') ?? stringField(payload, 'description'),
    projectUid: stringField(payload, 'projectUid')
      ?? stringField(payload, 'project_uid')
      ?? stringField(recordField(payload, 'locator'), 'projectUid')
      ?? stringField(recordField(payload, 'locator'), 'project_uid')
      ?? stringField(project, 'projectUid')
      ?? stringField(project, 'project_uid')
      ?? stringField(project, 'uid'),
    updatedAt: stringField(project, 'updatedAt') ?? stringField(project, 'UpdatedAt') ?? stringField(payload, 'updatedAt'),
  }
}

function mcpResultPayload(result: unknown): Record<string, unknown> | undefined {
  const resultRecord = recordValue(result)
  if (!resultRecord) return undefined
  return recordField(resultRecord, 'data')
    ?? recordField(resultRecord, 'structuredContent')
    ?? resultRecord
}

function recordField(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return recordValue(record?.[key])
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function rememberMcpProjectRecentKey(key: string): void {
  rememberedMcpProjectRecentKeys.add(key)
  if (rememberedMcpProjectRecentKeys.size <= REMEMBERED_MCP_PROJECT_RECENT_KEY_LIMIT) return
  const oldest = rememberedMcpProjectRecentKeys.values().next().value
  if (oldest) rememberedMcpProjectRecentKeys.delete(oldest)
}
