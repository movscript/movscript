import type { AgentManifest } from './manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRunPolicy,
  CompiledPromptPreview,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from './types.js'
import type { AgentMemory } from './memory/types.js'

export interface CompileAgentPromptInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  history: AgentMessage[]
  userMessage: string
}

export function compilePromptPreview(input: CompileAgentPromptInput): CompiledPromptPreview {
  const debugParts: CompiledPromptPreview['debugParts'] = []

  debugParts.push({
    id: 'agent.identity',
    kind: 'policy',
    title: 'Agent identity',
    content: [
      '你是 MovScript Agent，一个专注于短剧和视频内容创作的助手。',
      '你只围绕当前 MovScript 项目工作，不处理与当前项目无关的通用请求。',
      '你必须根据上下文和可用工具行动；工具不支持的事情要明确说明做不到。',
    ].join('\n'),
  })

  debugParts.push({
    id: 'policy.boundary',
    kind: 'policy',
    title: 'Runtime policy',
    content: [
      '读取和修改项目内容必须通过可用工具完成。',
      '正式写入前优先创建草稿，并等待用户确认后再应用。',
      '除非用户明确要求，不跨越当前选中实体修改其他内容。',
      input.policy.sandboxMode ? '当前运行处于 sandbox 模式：write/generate/destructive 工具会被模拟拦截。' : undefined,
      `approvalMode=${input.policy.approvalMode}; maxToolCalls=${input.policy.maxToolCalls}; maxIterations=${input.policy.maxIterations}`,
    ].filter(Boolean).join('\n'),
  })

  if (input.manifest.soul) {
    debugParts.push({
      id: 'agent.soul',
      kind: 'soul',
      title: 'Agent soul',
      content: input.manifest.soul,
    })
  }

  for (const skill of input.skills) {
    debugParts.push({
      id: `skill.${skill.id}`,
      kind: 'skill',
      title: skill.name,
      content: skill.compiledInstruction || skill.description,
    })
  }

  debugParts.push({
    id: 'context.summary',
    kind: 'context',
    title: 'Current context',
    content: [
      `route: ${input.context.route.pathname}${input.context.route.search ?? ''}${input.context.route.hash ?? ''}`,
      input.context.project ? `project: ${input.context.project.id}${input.context.project.name ? ` ${input.context.project.name}` : ''}` : 'project: none',
      input.context.selection ? `selection: ${input.context.selection.entityType}#${input.context.selection.entityId}${input.context.selection.label ? ` ${input.context.selection.label}` : ''}` : 'selection: none',
      `memories: ${input.memories.length}`,
      `attachments: ${input.context.attachments.length}`,
    ].join('\n'),
  })

  debugParts.push({
    id: 'tools.available',
    kind: 'tool',
    title: 'Available tools',
    content: input.tools.available.map((tool) => `- ${tool.name} (${tool.risk ?? 'unknown'}): ${tool.description ?? ''}`).join('\n') || '(none)',
  })

  const system = debugParts
    .map((part) => `[${part.title}]\n${part.content}`)
    .join('\n\n')

  return {
    system,
    messages: [
      ...input.history.map((message) => ({ role: message.role, content: message.content })),
      { role: 'user', content: input.userMessage },
    ],
    debugParts,
  }
}
