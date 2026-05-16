import type { ResolvedAgentSkill } from '../state/types.js'
import { publicToolName } from './toolNames.js'

export const BASE_RETRIEVAL_TOOLS = new Set([
  'movscript_request_user_input',
  'movscript_get_focus',
  'movscript_list_projects',
  'movscript_read_project_scripts',
  'movscript_query_creative_references',
  'movscript_query_asset_slots',
  'movscript_query_production_context',
  'movscript_get_draft_model',
  'movscript_list_drafts',
  'movscript_read_draft',
  'movscript_get_draft',
  'movscript_search_memories',
  'movscript_get_memory',
  'movscript_inspect_agent_catalog',
  'movscript_list_models',
  'movscript_list_generation_jobs',
  'movscript_get_generation_job',
  'movscript_create_plan',
  'movscript_get_plan',
  'movscript_replan',
  'movscript_spawn_subagent',
  'movscript_list_subagents',
  'movscript_wait_subagent',
  'movscript_cancel_subagent',
])

export const COMMAND_REQUIRED_TOOLS = new Set([
  'movscript_create_generation_job',
])

export function isToolVisibleForActiveBehavior(input: {
  toolName: string
  activeSkills: ResolvedAgentSkill[]
  userMessage: string
}): boolean {
  const name = publicToolName(input.toolName)
  if (BASE_RETRIEVAL_TOOLS.has(name)) return true
  if (COMMAND_REQUIRED_TOOLS.has(name) && /^\/(?:image|video)\b/i.test(input.userMessage.trim())) return true
  if (input.activeSkills.length === 0) return false
  const activeToolHints = new Set<string>()
  for (const skill of input.activeSkills) {
    if (skill.metadata?.kind !== 'workflow' && skill.category !== 'workflow') continue
    if (skill.metadata?.toolScope === 'union') return true
    for (const hint of skill.toolHints ?? []) activeToolHints.add(publicToolName(normalizeToolRef(hint)))
  }
  if (activeToolHints.size === 0) return false
  return activeToolHints.has(name)
}

function normalizeToolRef(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}
