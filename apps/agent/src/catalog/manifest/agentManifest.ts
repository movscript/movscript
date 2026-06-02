import type {
  AgentManifest,
  AgentToolApprovalMode,
  AgentToolGrantMode,
} from '@movscript/protocol'
import { isJSONRecord, isRecord } from '../../shared/json/jsonValue.js'

export type { AgentManifest, AgentToolApprovalMode, AgentToolGrantMode }
export type AgentManifestSchema = AgentManifest['schema']
export type AgentToolGrant = AgentManifest['tools'][number]

export const DEFAULT_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'movscript.default.local-agent',
  version: '0.1.0',
  name: 'MovScript Local Agent',
  description: 'Default local agent with project read and local workspace update permissions.',
  tools: [
    { name: 'movscript_focus_get', mode: 'allow', approval: 'never' },
    { name: 'movscript_project_list', mode: 'allow', approval: 'never' },
    { name: 'movscript_project_standards_get', mode: 'allow', approval: 'never' },
    { name: 'movscript_script_locate', mode: 'allow', approval: 'never' },
    { name: 'core_file_read', mode: 'allow', approval: 'never' },
    { name: 'core_file_search', mode: 'allow', approval: 'never' },
    { name: 'core_file_edit', mode: 'allow', approval: 'never' },
    { name: 'core_video_extract_frames', mode: 'allow', approval: 'never' },
    { name: 'get_workspace_model', mode: 'allow', approval: 'never' },
    { name: 'workspace_open', mode: 'allow', approval: 'never' },
    { name: 'workspace_validate', mode: 'allow', approval: 'never' },
    { name: 'workspace_apply', mode: 'allow', approval: 'on_write' },
    { name: 'core_memory_search', mode: 'allow', approval: 'never' },
    { name: 'core_memory_get', mode: 'allow', approval: 'never' },
    { name: 'core_memory_create', mode: 'allow', approval: 'never' },
    { name: 'core_memory_delete', mode: 'allow', approval: 'never' },
    { name: 'core_catalog_inspect', mode: 'allow', approval: 'never' },
    { name: 'core_update_plan', mode: 'allow', approval: 'never' },
    { name: 'core_work_start', mode: 'allow', approval: 'never' },
    { name: 'core_work_get', mode: 'allow', approval: 'never' },
    { name: 'core_work_list', mode: 'allow', approval: 'never' },
    { name: 'core_work_wait', mode: 'allow', approval: 'never' },
    { name: 'core_work_cancel', mode: 'allow', approval: 'never' },
    { name: 'core_user_input_request', mode: 'allow', approval: 'never' },
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
