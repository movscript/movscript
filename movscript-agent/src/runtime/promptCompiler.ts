import type { AgentInputEnvelope, CompiledPromptPreview } from './types.js'

export function compilePromptPreview(envelope: AgentInputEnvelope): CompiledPromptPreview {
  const debugParts: CompiledPromptPreview['debugParts'] = []

  debugParts.push({
    id: 'policy.base',
    kind: 'policy',
    title: 'Runtime policy',
    content: [
      '不得绕过 tool policy、manifest permissions 或用户审批。',
      '写入正式项目数据前必须先使用 draft/apply 审批链路。',
      `maxToolCalls=${envelope.policy.maxToolCalls}; maxIterations=${envelope.policy.maxIterations}`,
    ].join('\n'),
  })

  if (envelope.manifest.soul) {
    debugParts.push({
      id: 'agent.soul',
      kind: 'soul',
      title: 'Agent soul',
      content: envelope.manifest.soul,
    })
  }

  for (const skill of envelope.skills) {
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
    title: 'Context summary',
    content: [
      `route: ${envelope.context.route.pathname}`,
      envelope.context.project ? `project: ${envelope.context.project.id}${envelope.context.project.name ? ` ${envelope.context.project.name}` : ''}` : 'project: none',
      envelope.context.selection ? `selection: ${envelope.context.selection.entityType}#${envelope.context.selection.entityId}` : 'selection: none',
      `memories: ${envelope.memories.length}`,
      `attachments: ${envelope.context.attachments.length}`,
    ].join('\n'),
  })

  debugParts.push({
    id: 'tools.available',
    kind: 'tool',
    title: 'Available tools',
    content: envelope.tools.available.map((tool) => `- ${tool.name} (${tool.risk ?? 'unknown'})`).join('\n') || '(none)',
  })

  const system = debugParts
    .filter((part) => part.kind !== 'context')
    .map((part) => `[${part.title}]\n${part.content}`)
    .join('\n\n')

  return {
    system,
    messages: [
      ...envelope.history.map((message) => ({ role: message.role, content: message.content })),
      { role: envelope.message.role, content: envelope.message.content },
    ],
    debugParts,
  }
}
