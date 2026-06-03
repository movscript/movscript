import type { ResolvedAgentSkill } from '../../../../state/shared/types.js'
import { publicToolName } from '../../../registry/naming/toolNames.js'

export const BASE_RETRIEVAL_TOOLS = new Set([
  'core_user_input_request',
  'core_catalog_inspect',
  'core_skill_update',
  'core_update_plan',
  'core_video_extract_frames',
])

export const COMMAND_REQUIRED_TOOLS = new Set([
  'core_work_start',
  'core_work_wait',
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
    if (skill.metadata?.toolScope === 'union') return true
    for (const ref of skill.toolGrants ?? []) activeToolHints.add(publicToolName(ref.trim()))
    for (const hint of skill.toolHints ?? []) activeToolHints.add(publicToolName(normalizeToolHint(hint)))
  }
  if (activeToolHints.size === 0) return false
  return activeToolHints.has(name)
}

function normalizeToolHint(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}
