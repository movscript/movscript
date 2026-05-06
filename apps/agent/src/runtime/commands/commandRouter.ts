export type AgentCommandName =
  | 'chat'
  | 'context'
  | 'memory'

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
    case '/context':
      return {
        name: 'context',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a runtime context diagnostic command.',
          'Return only the text context that would be sent to the model gateway. Do not create drafts, search, navigate, write data, or call the model gateway.',
        ].join('\n'),
      }
    case '/memory':
      return {
        name: 'memory',
        rawName: firstToken,
        payload,
        contextProfile: 'minimal',
        outputMode: 'natural',
        requiredTools: [],
        systemContract: [
          'This is a runtime memory diagnostic command.',
          'Return only the memory files opened for this run. Do not include memory content, create drafts, search, navigate, write data, or call the model gateway.',
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
