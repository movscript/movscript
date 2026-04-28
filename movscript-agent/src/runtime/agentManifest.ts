import type { JSONValue } from '../types.js'

export type AgentManifestSchema = 'movscript.agent.v1'
export type AgentToolGrantMode = 'allow' | 'deny'
export type AgentToolApprovalMode = 'never' | 'always' | 'on_write'

export interface AgentToolGrant {
  name: string
  mode: AgentToolGrantMode
  approval?: AgentToolApprovalMode
}

export interface AgentManifest {
  schema: AgentManifestSchema
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  permissions: string[]
  tools: AgentToolGrant[]
  metadata?: Record<string, JSONValue>
}

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.v1',
  id: 'movscript.default.local-agent',
  version: '0.1.0',
  name: 'MovScript Local Agent',
  description: 'Default local agent with first-version read and draft permissions.',
  permissions: [
    'project.read',
    'draft.read',
    'draft.write',
    'ui.navigate',
  ],
  tools: [
    { name: 'movscript.search_entities', mode: 'allow', approval: 'never' },
    { name: 'movscript.read_entity', mode: 'allow', approval: 'never' },
    { name: 'movscript.create_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript.list_drafts', mode: 'allow', approval: 'never' },
    { name: 'movscript.open_entity', mode: 'allow', approval: 'never' },
  ],
}

export function normalizeAgentManifest(input: unknown): AgentManifest {
  if (!isRecord(input)) return DEFAULT_AGENT_MANIFEST
  if (input.schema !== 'movscript.agent.v1') return DEFAULT_AGENT_MANIFEST

  const id = nonEmptyString(input.id) ?? DEFAULT_AGENT_MANIFEST.id
  const version = nonEmptyString(input.version) ?? DEFAULT_AGENT_MANIFEST.version
  const name = nonEmptyString(input.name) ?? DEFAULT_AGENT_MANIFEST.name
  const permissions = stringArray(input.permissions)
  const tools = toolGrantArray(input.tools)

  return {
    schema: 'movscript.agent.v1',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    ...(nonEmptyString(input.soul) ? { soul: nonEmptyString(input.soul) } : {}),
    permissions,
    tools,
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
}

export function manifestAllowsPermission(manifest: AgentManifest, permission: string): boolean {
  return manifest.permissions.includes(permission)
}

export function findToolGrant(manifest: AgentManifest, toolName: string): AgentToolGrant | undefined {
  return manifest.tools.find((grant) => grant.name === toolName)
}

function toolGrantArray(value: unknown): AgentToolGrant[] {
  if (!Array.isArray(value)) return []
  const grants: AgentToolGrant[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const name = nonEmptyString(item.name)
    if (!name) continue
    const mode = item.mode === 'deny' ? 'deny' : 'allow'
    const approval = item.approval === 'always' || item.approval === 'on_write' || item.approval === 'never'
      ? item.approval
      : undefined
    grants.push({ name, mode, ...(approval ? { approval } : {}) })
  }
  return grants
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}
