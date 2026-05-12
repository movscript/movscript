import type { JSONValue } from '../types.js'

export type AgentManifestSchema = 'movscript.agent.current'
export type AgentToolGrantMode = 'allow' | 'deny'
export type AgentToolApprovalMode = 'never' | 'always' | 'on_write'

export interface AgentToolGrant {
  name: string
  mode: AgentToolGrantMode
  approval?: AgentToolApprovalMode
}

export interface AgentSkillManifest {
  id: string
  name: string
  description: string
  version?: string
  category?: string
  categories?: string[]
  enabled: boolean
  priority?: number
  instruction: string
  inputHints?: string[]
  outputContract?: string
  toolHints?: string[]
  metadata?: Record<string, JSONValue>
}

export interface AgentManifest {
  schema: AgentManifestSchema
  id: string
  version: string
  name: string
  description?: string
  soul?: string
  skills: AgentSkillManifest[]
  tools: AgentToolGrant[]
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, JSONValue>
}

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'movscript.default.local-agent',
  version: '0.1.0',
  name: 'MovScript Local Agent',
  description: 'Default local agent with project read and local draft update permissions.',
  skills: [],
  tools: [
    { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_projects', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_search_memories', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_delete_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_reload_agent_catalog', mode: 'allow', approval: 'always' },
    { name: 'movscript_spawn_subagent', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_subagents', mode: 'allow', approval: 'never' },
    { name: 'movscript_wait_subagent', mode: 'allow', approval: 'never' },
    { name: 'movscript_cancel_subagent', mode: 'allow', approval: 'never' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
  ],
}

export function normalizeAgentManifest(input: unknown): AgentManifest {
  if (!isRecord(input)) return DEFAULT_AGENT_MANIFEST
  if (input.schema !== 'movscript.agent.current') return DEFAULT_AGENT_MANIFEST

  const id = nonEmptyString(input.id) ?? DEFAULT_AGENT_MANIFEST.id
  const version = nonEmptyString(input.version) ?? DEFAULT_AGENT_MANIFEST.version
  const name = nonEmptyString(input.name) ?? DEFAULT_AGENT_MANIFEST.name
  const tools = toolGrantArray(input.tools)
  const skills = skillManifestArray(input.skills)

  return {
    schema: 'movscript.agent.current',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    ...(nonEmptyString(input.soul) ? { soul: nonEmptyString(input.soul) } : {}),
    skills,
    tools,
    ...(isRecord(input.model) ? { model: normalizeModelBinding(input.model) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
}

export function mergeAgentManifestSkills(manifest: AgentManifest, skills: AgentSkillManifest[]): AgentManifest {
  void skills
  return manifest
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

function skillManifestArray(value: unknown): AgentSkillManifest[] {
  if (!Array.isArray(value)) return []
  const skills: AgentSkillManifest[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = nonEmptyString(item.id)
    const name = nonEmptyString(item.name)
    if (!id || !name) continue
    const description = nonEmptyString(item.description) ?? ''
    const instruction = nonEmptyString(item.instruction) ?? description
    skills.push({
      id,
      name,
      description,
      enabled: item.enabled !== false,
      ...(typeof item.priority === 'number' && Number.isFinite(item.priority) ? { priority: item.priority } : {}),
      instruction,
      ...(nonEmptyString(item.category) ? { category: nonEmptyString(item.category) } : {}),
      ...(stringArray(item.categories).length > 0 ? { categories: stringArray(item.categories) } : {}),
      ...(nonEmptyString(item.version) ? { version: nonEmptyString(item.version) } : {}),
      ...(stringArray(item.inputHints).length > 0 ? { inputHints: stringArray(item.inputHints) } : {}),
      ...(nonEmptyString(item.outputContract) ? { outputContract: nonEmptyString(item.outputContract) } : {}),
      ...(stringArray(item.toolHints).length > 0 ? { toolHints: stringArray(item.toolHints) } : {}),
      ...(isJSONRecord(item.metadata) ? { metadata: item.metadata } : {}),
    })
  }
  return skills
}

export function normalizeAgentSkillManifest(input: unknown): AgentSkillManifest | undefined {
  return skillManifestArray([input])[0]
}

function normalizeModelBinding(value: Record<string, unknown>): AgentManifest['model'] {
  return {
    ...(nonEmptyString(value.provider) ? { provider: nonEmptyString(value.provider) } : {}),
    ...(nonEmptyString(value.modelId) ? { modelId: nonEmptyString(value.modelId) } : {}),
    ...(typeof value.platformModelId === 'number' && Number.isFinite(value.platformModelId) ? { platformModelId: value.platformModelId } : {}),
  }
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
