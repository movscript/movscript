import type { JSONValue } from '../types.js'
import { isJSONRecord, isRecord } from '../jsonValue.js'

export type AgentManifestSchema = 'movscript.agent.current'
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
  tools: [
    { name: 'movscript_get_focus', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_projects', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_project_standards', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' },
    { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_apply_draft', mode: 'allow', approval: 'on_write' },
    { name: 'movscript_search_memories', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_delete_memory', mode: 'allow', approval: 'never' },
    { name: 'movscript_inspect_agent_catalog', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_plan', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_plan', mode: 'allow', approval: 'never' },
    { name: 'movscript_replan', mode: 'allow', approval: 'never' },
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

  return {
    schema: 'movscript.agent.current',
    id,
    version,
    name,
    ...(nonEmptyString(input.description) ? { description: nonEmptyString(input.description) } : {}),
    ...(nonEmptyString(input.soul) ? { soul: nonEmptyString(input.soul) } : {}),
    tools,
    ...(isRecord(input.model) ? { model: normalizeModelBinding(input.model) } : {}),
    ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
  }
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

function normalizeModelBinding(value: Record<string, unknown>): AgentManifest['model'] {
  return {
    ...(nonEmptyString(value.provider) ? { provider: nonEmptyString(value.provider) } : {}),
    ...(nonEmptyString(value.modelId) ? { modelId: nonEmptyString(value.modelId) } : {}),
    ...(typeof value.platformModelId === 'number' && Number.isFinite(value.platformModelId) ? { platformModelId: value.platformModelId } : {}),
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
