export type AgentCommandName =
  | 'chat'
  | 'inspect_context'
  | 'production_plan'
  | 'draft'
  | 'search'
  | 'project_structure'
  | 'read_entity'
  | 'list_drafts'
  | 'apply_draft'

export type AgentContextProfile =
  | 'minimal'
  | 'selected_entity'
  | 'project_structure'
  | 'production_context'

export type AgentOutputMode = 'natural' | 'json'

export interface AgentCommandRuntime {
  name: AgentCommandName
  rawName?: string
  payload: string
  contextProfile: AgentContextProfile
  outputMode: AgentOutputMode
  requiredTools: string[]
  systemContract: string
}

export function parseAgentCommand(message: string): AgentCommandRuntime {
  const trimmed = message.trim()
  const firstToken = trimmed.split(/\s+/, 1)[0] ?? ''
  const payload = firstToken.startsWith('/') ? trimmed.slice(firstToken.length).trim() : trimmed

  switch (firstToken) {
    case '/inspect_context':
    case '/context':
      return {
        name: 'inspect_context',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'json',
        requiredTools: ['movscript_get_context_pack'],
        systemContract: [
          'This is an inspect-context command.',
          'Return only the runtime context representation. Do not create drafts, search, navigate, or write data.',
        ].join('\n'),
      }
    case '/production_plan':
    case '/project_plan':
      return {
        name: 'production_plan',
        rawName: firstToken,
        payload,
        contextProfile: 'production_context',
        outputMode: 'json',
        requiredTools: [
          'movscript_read_project_structure',
          'movscript_list_productions',
          'movscript_read_production_context',
          'movscript_check_entity_conflicts',
          'movscript_propose_production_entities',
        ],
        systemContract: [
          'This is a production-planning command.',
          'Plan with project and production context before proposing changes.',
          'Return machine-readable JSON for the user-facing final answer.',
          'Use draft/proposal tools for proposed changes; do not claim formal project writes unless a write tool succeeds.',
        ].join('\n'),
      }
    case '/draft':
      return {
        name: 'draft',
        rawName: firstToken,
        payload,
        contextProfile: 'selected_entity',
        outputMode: 'natural',
        requiredTools: ['movscript_create_draft', 'movscript_list_drafts'],
        systemContract: [
          'This is a draft command.',
          'Create or update local draft artifacts only. Formal project data must not be changed.',
          'Keep the final answer scoped to the draft created, its kind, and the next review action.',
        ].join('\n'),
      }
    case '/search':
      return {
        name: 'search',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'natural',
        requiredTools: ['movscript_search_entities'],
        systemContract: 'This is a search command. Search project entities before answering.',
      }
    case '/project_structure':
      return {
        name: 'project_structure',
        rawName: firstToken,
        payload,
        contextProfile: 'project_structure',
        outputMode: 'natural',
        requiredTools: ['movscript_read_project_structure'],
        systemContract: 'This is a project-structure command. Read the compact project structure before answering.',
      }
    case '/read_entity':
      return {
        name: 'read_entity',
        rawName: firstToken,
        payload,
        contextProfile: 'selected_entity',
        outputMode: 'natural',
        requiredTools: ['movscript_read_entity'],
        systemContract: 'This is a read-entity command. Read the exact entity when type and id are available.',
      }
    case '/list_drafts':
      return {
        name: 'list_drafts',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'natural',
        requiredTools: ['movscript_list_drafts'],
        systemContract: 'This is a list-drafts command. List local drafts before answering.',
      }
    case '/apply_draft':
      return {
        name: 'apply_draft',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'natural',
        requiredTools: ['movscript_apply_draft'],
        systemContract: [
          'This is an apply-draft command.',
          'Applying a draft is a write-risk action and must go through runtime approval when required.',
        ].join('\n'),
      }
    default:
      return {
        name: 'chat',
        payload: trimmed,
        contextProfile: inferContextProfile(trimmed),
        outputMode: 'natural',
        requiredTools: [],
        systemContract: 'This is a natural-language agent request. Choose tools based on the user goal and current context.',
      }
  }
}

function inferContextProfile(message: string): AgentContextProfile {
  if (/production|制作|编排|片段|情节|scene moment|segment/i.test(message)) return 'production_context'
  if (/项目结构|project structure|进度|progress|缺口|missing/i.test(message)) return 'project_structure'
  if (/当前|选中|这个|this entity|read entity|修改|改写/i.test(message)) return 'selected_entity'
  return 'minimal'
}
