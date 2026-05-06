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
import { parseAgentCommand, type AgentCommandRuntime } from '../commands/commandRouter.js'
import { renderDebugContextText, renderMemoriesText, renderToolCatalogText } from '../contextText.js'
import {
  CHECK_ENTITY_CONFLICTS_SCHEMA,
  PRODUCTION_ORCHESTRATION_CONTRACT,
  PROPOSE_PRODUCTION_ENTITIES_SCHEMA,
  READ_PRODUCTION_CONTEXT_SCHEMA,
  isProductionOrchestrationAnalyzer,
} from '../production/orchestrationContract.js'

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
  command?: AgentCommandRuntime
}

export interface BuiltContext {
  messages: RuntimeModelChatMessage[]
  systemPrompt: string
  systemMessages: RuntimeModelChatMessage[]
  debugParts: CompiledPromptPreview['debugParts']
}

export function buildContext(input: ContextBuilderInput): BuiltContext {
  const debugParts: CompiledPromptPreview['debugParts'] = []
  const command = input.command ?? parseAgentCommand(input.userMessage)

  // --- Context ---
  debugParts.push({
    id: 'context.summary',
    kind: 'context',
    title: 'Current context',
    content: renderDebugContextText(input.context),
  })

  // --- Command ---
  debugParts.push({
    id: `command.${command.name}`,
    kind: 'policy',
    title: 'Command contract',
    content: [
      `command: ${command.rawName ?? command.name}`,
      `contextProfile: ${command.contextProfile}`,
      `outputMode: ${command.outputMode}`,
      command.payload ? `payload: ${command.payload}` : undefined,
      command.requiredTools.length > 0 ? `requiredTools: ${command.requiredTools.join(', ')}` : undefined,
      '',
      command.systemContract,
      command.outputMode === 'json' ? 'The final answer must be a valid JSON object with no markdown fences.' : undefined,
    ].filter(Boolean).join('\n'),
  })

  // --- Identity ---
  const identityLines = [
    'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
    'Answer in the same language as the user unless they ask otherwise.',
    'Use the runtime context, tool results, and startup memories when available.',
    'Startup memories are intentionally small. When older preferences, decisions, warnings, entity references, or draft notes may matter, call movscript_search_memories with a focused query instead of assuming all memories are present.',
    'When context is missing or ambiguous and guessing would affect the outcome, call movscript_request_user_input with a clear title, short summary, and 2-4 concrete choices or a free-form question.',
    'When reading context, decide from titles, summaries, labels, descriptions, and user-facing names first. Treat ids as references for tool calls, not as the primary meaning of the context.',
    'Do not claim you changed project data unless a tool result proves it.',
    'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
  ]
  if (input.manifest.soul) {
    identityLines.push('', '[Agent-specific output contract]', input.manifest.soul)
  }
  if (isProductionOrchestrationAnalyzer(input.manifest.id)) {
    identityLines.push('', '[Production orchestration structured contract]', PRODUCTION_ORCHESTRATION_CONTRACT)
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

  // --- Memories ---
  if (input.memories.length > 0) {
    debugParts.push({
      id: 'context.memories',
      kind: 'context',
      title: 'Relevant memories',
      content: renderMemoriesText(input.memories),
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
    content: renderToolCatalogText(input.tools),
  })

  const systemPrompt = debugParts
    .map((part) => `## ${part.title}\n${part.content}`)
    .join('\n\n')
  const primaryContextParts = debugParts.filter((part) => part.id === 'context.summary' || part.id === 'context.memories')
  const otherParts = debugParts.filter((part) => part.id !== 'context.summary' && part.id !== 'context.memories')
  const systemMessages: RuntimeModelChatMessage[] = [
    ...(primaryContextParts.length > 0 ? [{
      role: 'system' as const,
      content: primaryContextParts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n'),
    }] : []),
    ...otherParts.map((part) => ({
      role: 'system' as const,
      content: `## ${part.title}\n${part.content}`,
    })),
  ]

  const messages: RuntimeModelChatMessage[] = [
    ...systemMessages,
    ...input.history.map((msg): RuntimeModelChatMessage => ({ role: msg.role as RuntimeModelChatMessage['role'], content: msg.content })),
    { role: 'user', content: input.userMessage },
  ]

  return { messages, systemPrompt, systemMessages, debugParts }
}

export function buildOpenAIChatTools(catalog: ResolvedToolCatalog): RuntimeModelChatTool[] {
  return catalog.available.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema !== undefined ? { parameters: tool.inputSchema } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_request_user_input' ? { parameters: USER_INPUT_TOOL_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_search_memories' ? { parameters: SEARCH_MEMORIES_TOOL_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_create_project' ? { parameters: CREATE_PROJECT_TOOL_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_create_script' ? { parameters: CREATE_SCRIPT_TOOL_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_read_production_context' ? { parameters: READ_PRODUCTION_CONTEXT_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_check_entity_conflicts' ? { parameters: CHECK_ENTITY_CONFLICTS_SCHEMA } : {}),
      ...(tool.inputSchema === undefined && tool.name === 'movscript_propose_production_entities' ? { parameters: PROPOSE_PRODUCTION_ENTITIES_SCHEMA } : {}),
    },
  }))
}

const SEARCH_MEMORIES_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description: 'Focused keywords or a short phrase to search in memory content.',
    },
    scope: {
      type: 'string',
      enum: ['global', 'project', 'thread'],
      description: 'Optional scope filter. Omit to search visible global, current project, and current thread memories.',
    },
    kind: {
      type: 'string',
      enum: ['preference', 'fact', 'entity_ref', 'draft', 'decision', 'warning'],
      description: 'Optional memory kind filter.',
    },
    projectId: {
      type: 'number',
      description: 'Optional project reference id. Defaults to the current project when available.',
    },
    threadId: {
      type: 'string',
      description: 'Optional thread reference id. Defaults to the current thread.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 25,
      description: 'Maximum number of memories to return.',
    },
  },
} satisfies Record<string, unknown>

const USER_INPUT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'A short title that names the missing decision or context.',
    },
    summary: {
      type: 'string',
      description: 'One sentence explaining why the agent needs this input before continuing.',
    },
    question: {
      type: 'string',
      description: 'The exact question shown to the user.',
    },
    inputType: {
      type: 'string',
      enum: ['choice', 'text', 'confirmation'],
    },
    allowCustomAnswer: {
      type: 'boolean',
      description: 'Whether the user may provide a custom answer outside the provided choices.',
    },
    choices: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id', 'label'],
      },
    },
  },
  required: ['title', 'question'],
} satisfies Record<string, unknown>

const CREATE_PROJECT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Required project name.' },
    description: { type: 'string', description: 'Optional short project description.' },
    status: { type: 'string', description: 'Optional initial project status, for example planning.' },
    total_episodes: { type: 'number', description: 'Optional planned episode count.' },
  },
  required: ['name'],
} satisfies Record<string, unknown>

const CREATE_SCRIPT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'number', description: 'Current project id. The runtime fills this when a project is selected.' },
    title: { type: 'string', description: 'Script title.' },
    content: { type: 'string', description: 'Full script body or complete outline to save.' },
    raw_source: { type: 'string', description: 'Original raw source text. Defaults to content.' },
    description: { type: 'string' },
    script_type: { type: 'string', description: 'User-facing category tag, such as short_drama, episode, outline, revised.' },
    source_type: { type: 'string', enum: ['raw', 'adapted', 'revised'] },
    summary: { type: 'string' },
    characters: { type: 'string' },
    core_settings: { type: 'string' },
    hook: { type: 'string' },
    plot_summary: { type: 'string' },
    script_points: { type: 'string', description: 'JSON string or structured notes for key beats.' },
    planned_scene_count: { type: 'number' },
    planned_character_count: { type: 'number' },
    time_text: { type: 'string' },
    location_text: { type: 'string' },
    structured_characters: { type: 'string', description: 'JSON string or structured notes for characters.' },
    plot_beats: { type: 'string', description: 'JSON string or structured notes for plot beats.' },
    atmosphere: { type: 'string' },
    structure_json: { type: 'string', description: 'Full normalized structured script payload as JSON string when available.' },
    order: { type: 'number' },
  },
  required: ['title', 'content'],
} satisfies Record<string, unknown>

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
