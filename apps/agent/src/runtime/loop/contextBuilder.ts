import type { AgentManifest } from '../manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRunPolicy,
  CompiledPromptPreview,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../types.js'
import type { AgentMemory } from '../memory/types.js'
import type { RuntimeModelChatMessage, RuntimeModelChatTool } from '../model/modelConfig.js'

export interface ContextBuilderInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
}

export interface BuiltContext {
  messages: RuntimeModelChatMessage[]
  systemPrompt: string
  debugParts: CompiledPromptPreview['debugParts']
}

export function buildContext(input: ContextBuilderInput): BuiltContext {
  const debugParts: CompiledPromptPreview['debugParts'] = []

  // --- Identity ---
  const identityLines = [
    'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
    'Answer in the same language as the user unless they ask otherwise.',
    'Use the runtime context, tool results, and memories when available.',
    'Do not claim you changed project data unless a tool result proves it.',
    'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
  ]
  if (input.manifest.soul) {
    identityLines.push('', '[Agent-specific output contract]', input.manifest.soul)
  }
  debugParts.push({
    id: 'agent.identity',
    kind: 'soul',
    title: 'Agent identity',
    content: identityLines.join('\n'),
  })

  // --- Policy ---
  const policyLines = [
    `approvalMode: ${input.policy.approvalMode}`,
    `maxToolCalls: ${input.policy.maxToolCalls}`,
    `maxIterations: ${input.policy.maxIterations}`,
    input.policy.sandboxMode ? 'sandboxMode: true — write/generate/destructive tools are intercepted and simulated' : undefined,
  ].filter(Boolean) as string[]
  debugParts.push({
    id: 'policy.runtime',
    kind: 'policy',
    title: 'Runtime policy',
    content: policyLines.join('\n'),
  })

  // --- Skills ---
  for (const skill of input.skills) {
    debugParts.push({
      id: `skill.${skill.id}`,
      kind: 'skill',
      title: skill.name,
      content: skill.compiledInstruction || skill.description,
    })
  }

  // --- Context ---
  const contextLines = [
    `route: ${input.context.route.pathname}${input.context.route.search ?? ''}${input.context.route.hash ?? ''}`,
    input.context.project
      ? `project: id=${input.context.project.id}${input.context.project.name ? ` name="${input.context.project.name}"` : ''}${input.context.project.status ? ` status=${input.context.project.status}` : ''}`
      : 'project: none',
    input.context.productionId !== undefined ? `productionId: ${input.context.productionId}` : undefined,
    input.context.selection
      ? `selection: ${input.context.selection.entityType}#${input.context.selection.entityId}${input.context.selection.label ? ` "${input.context.selection.label}"` : ''}`
      : 'selection: none',
    input.context.user ? `user: id=${input.context.user.id} username=${input.context.user.username}` : undefined,
    input.context.recentResources.length > 0
      ? `recentResources: ${input.context.recentResources.map((r) => `${r.type}#${r.id} "${r.name}"`).join(', ')}`
      : undefined,
    input.context.attachments.length > 0
      ? `attachments: ${input.context.attachments.map((a) => `${a.type} "${a.name}"`).join(', ')}`
      : undefined,
    input.context.labels.length > 0 ? `labels: ${input.context.labels.join(', ')}` : undefined,
  ].filter(Boolean) as string[]

  // Include a JSON block so downstream consumers can parse structured context
  const contextJSON = JSON.stringify({
    route: input.context.route,
    ...(input.context.project ? { project: input.context.project } : {}),
    ...(input.context.productionId !== undefined ? { productionId: input.context.productionId } : {}),
    ...(input.context.selection ? { selection: input.context.selection } : {}),
    ...(input.context.user ? { user: input.context.user } : {}),
    ...(input.context.labels.length > 0 ? { labels: input.context.labels } : {}),
  })
  contextLines.push('', 'Runtime context JSON:', contextJSON)

  debugParts.push({
    id: 'context.summary',
    kind: 'context',
    title: 'Current context',
    content: contextLines.join('\n'),
  })

  // --- Memories ---
  if (input.memories.length > 0) {
    debugParts.push({
      id: 'context.memories',
      kind: 'context',
      title: 'Relevant memories',
      content: input.memories.map((m) => `[${m.scope}/${m.kind}] ${m.content}`).join('\n'),
    })
  }

  // --- Warnings ---
  if (input.warnings.length > 0) {
    debugParts.push({
      id: 'context.warnings',
      kind: 'policy',
      title: 'Runtime warnings',
      content: input.warnings.join('\n'),
    })
  }

  // --- Tools ---
  debugParts.push({
    id: 'tools.available',
    kind: 'tool',
    title: 'Available tools',
    content: input.tools.available.map((t) => `- ${t.name} (${t.risk ?? 'unknown'}): ${t.description ?? ''}`).join('\n') || '(none)',
  })

  // Build single system prompt
  const systemPrompt = debugParts
    .map((part) => `## ${part.title}\n${part.content}`)
    .join('\n\n')

  // Build message array: system + history + user
  const messages: RuntimeModelChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...input.history.map((msg): RuntimeModelChatMessage => ({ role: msg.role as RuntimeModelChatMessage['role'], content: msg.content })),
    { role: 'user', content: input.userMessage },
  ]

  return { messages, systemPrompt, debugParts }
}

export function buildOpenAIChatTools(catalog: ResolvedToolCatalog): RuntimeModelChatTool[] {
  return catalog.available.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema !== undefined ? { parameters: tool.inputSchema } : {}),
    },
  }))
}

// Re-export CompiledPromptPreview-compatible output for previewRun
export function buildPromptPreview(input: ContextBuilderInput): CompiledPromptPreview {
  const { messages, systemPrompt, debugParts } = buildContext(input)
  return {
    system: systemPrompt,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content ?? '' })),
    debugParts,
  }
}
