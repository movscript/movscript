export type AgentCommandName =
  | 'chat'
  | 'context'
  | 'status'
  | 'compact'
  | 'memory'

export type AgentContextMode =
  | 'minimal'
  | 'selected_entity'
  | 'project_structure'
  | 'production_context'

export type AgentOutputMode = 'natural' | 'json'

export interface AgentCommandRuntime {
  name: AgentCommandName
  rawName?: string
  payload: string
  contextMode: AgentContextMode
  outputMode: AgentOutputMode
  requiredTools: string[]
  systemContract: string
}

export function parseAgentCommand(message: string): AgentCommandRuntime {
  const trimmed = message.trim()
  const firstToken = trimmed.split(/\s+/, 1)[0] ?? ''
  const payload = firstToken.startsWith('/') ? trimmed.slice(firstToken.length).trim() : trimmed

  switch (firstToken) {
    case '/context':
      return {
        name: 'context',
        rawName: firstToken,
        payload,
        contextMode: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a runtime context diagnostic command.',
          'Return only the text context that would be sent to the model gateway. Do not create workspaces, search, navigate, write data, or call the model gateway.',
        ].join('\n'),
      }
    case '/status':
      return {
        name: 'status',
        rawName: firstToken,
        payload,
        contextMode: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a runtime status diagnostic command.',
          'Return only local run, skill, tool, and context budget status. Do not create workspaces, search, navigate, write data, or call the model gateway.',
        ].join('\n'),
      }
    case '/compact':
      return {
        name: 'compact',
        rawName: firstToken,
        payload,
        contextMode: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a deterministic runtime compact command.',
          'Compact thread history into local continuity metadata and return the compaction result. Do not create workspaces, search, navigate, write project data, or call the model gateway.',
        ].join('\n'),
      }
    case '/memory':
      return {
        name: 'memory',
        rawName: firstToken,
        payload,
        contextMode: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a runtime memory diagnostic command.',
          'Return only the memory files opened for this run. Do not include memory content, create workspaces, search, navigate, write data, or call the model gateway.',
        ].join('\n'),
      }
    default:
      return {
        name: 'chat',
        payload: trimmed,
        contextMode: inferContextMode(trimmed),
        outputMode: 'natural',
        requiredTools: [],
        systemContract: 'This is a natural-language agent request. Choose tools based on the user goal and current focus.',
      }
  }
}

function inferContextMode(message: string): AgentContextMode {
  if (/项目结构|project structure|进度|progress|缺口|missing/i.test(message)) return 'project_structure'
  if (/当前|选中|这个|this entity|read entity|修改|改写/i.test(message)) return 'selected_entity'
  return 'minimal'
}
