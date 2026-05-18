import type { ResolvedAgentSkill } from '../state/types.js'
import { publicToolName } from './toolNames.js'

export const BASE_RETRIEVAL_TOOLS = new Set([
  'movscript_request_user_input',
  'movscript_inspect_agent_catalog',
  'movscript_update_active_skills',
  'movscript_reload_agent_catalog',
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
  if (name === 'movscript_get_focus' && /^\/context\b/i.test(input.userMessage.trim())) return true
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
