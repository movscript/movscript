import type { JSONValue } from '../types.js'

export type AgentManifestSchema = 'movscript.agent.v1' | 'movscript.agent.current'
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
  enabled: boolean
  priority?: number
  instruction: string
  appliesWhen?: string
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
  permissions: string[]
  tools: AgentToolGrant[]
  model?: {
    provider?: string
    modelId?: string
    platformModelId?: number
  }
  metadata?: Record<string, JSONValue>
  sourceSchema?: AgentManifestSchema
}

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'movscript.default.local-agent',
  version: '0.1.0',
  name: 'MovScript Local Agent',
  description: 'Default local agent with first-version read and draft permissions.',
  skills: [
    {
      id: 'movscript.default.safe-project-assistant',
      name: 'Safe Project Assistant',
      description: 'Read project context, search entities, and create local drafts without changing project data.',
      enabled: true,
      priority: 100,
      instruction: '优先读取当前项目上下文；需要产出内容时创建本地 draft，不直接修改正式项目实体。',
      toolHints: ['movscript_list_projects', 'movscript_search_entities', 'movscript_read_project_structure', 'movscript_read_entity', 'movscript_create_draft'],
    },
  ],
  permissions: [
    'project.read',
    'project.write',
    'draft.read',
    'draft.write',
    'agent.input',
    'ui.navigate',
  ],
  tools: [
    { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_projects', mode: 'allow', approval: 'never' },
    { name: 'movscript_search_entities', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_project_structure', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_entity', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_productions', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    { name: 'movscript_apply_draft', mode: 'allow', approval: 'always' },
    { name: 'movscript_open_entity', mode: 'allow', approval: 'never' },
  ],
}

export function normalizeAgentManifest(input: unknown): AgentManifest {
  if (!isRecord(input)) return DEFAULT_AGENT_MANIFEST
  if (input.schema !== 'movscript.agent.v1' && input.schema !== 'movscript.agent.current') return DEFAULT_AGENT_MANIFEST

  const id = nonEmptyString(input.id) ?? DEFAULT_AGENT_MANIFEST.id
  const version = nonEmptyString(input.version) ?? DEFAULT_AGENT_MANIFEST.version
  const name = nonEmptyString(input.name) ?? DEFAULT_AGENT_MANIFEST.name
  const permissions = stringArray(input.permissions)
  const tools = toolGrantArray(input.tools)
  const skills = input.schema === 'movscript.agent.current'
    ? skillManifestArray(input.skills)
    : legacySkillManifestArray(input)

  return {
    schema: 'movscript.agent.current',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    ...(nonEmptyString(input.soul) ? { soul: nonEmptyString(input.soul) } : {}),
    skills,
    permissions,
    tools,
    ...(isRecord(input.model) ? { model: normalizeModelBinding(input.model) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
    sourceSchema: input.schema,
  }
}

export function mergeAgentManifestSkills(manifest: AgentManifest, skills: AgentSkillManifest[]): AgentManifest {
  if (skills.length === 0) return manifest
  const byId = new Map<string, AgentSkillManifest>()
  for (const skill of manifest.skills) byId.set(skill.id, skill)
  for (const skill of skills) byId.set(skill.id, skill)
  return {
    ...manifest,
    skills: Array.from(byId.values()),
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
      ...(nonEmptyString(item.version) ? { version: nonEmptyString(item.version) } : {}),
      ...(nonEmptyString(item.appliesWhen) ? { appliesWhen: nonEmptyString(item.appliesWhen) } : {}),
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

function legacySkillManifestArray(input: Record<string, unknown>): AgentSkillManifest[] {
  if (Array.isArray(input.skills)) return skillManifestArray(input.skills)
  const metadata = isRecord(input.metadata) ? input.metadata : undefined
  const skillIds = stringArray(metadata?.skillIds)
  return skillIds.map((id, index) => ({
    id,
    name: id,
    description: '',
    enabled: true,
    priority: index,
    instruction: '',
    metadata: { source: 'legacy.metadata.skillIds' },
  }))
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
