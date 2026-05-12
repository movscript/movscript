import type { AgentManifest } from '../manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRunPolicy,
  CompiledPromptPreview,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../state/types.js'
import type { AgentMemory } from '../memory/types.js'
import type { RuntimeModelChatMessage, RuntimeModelChatTool } from '../model/modelConfig.js'
import { parseAgentCommand, type AgentCommandRuntime } from '../context/commandRouter.js'
import { renderDebugContextText, renderMemoriesText, renderToolCatalogText } from '../context/contextText.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../contracts/runtimeContract.js'

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
  contractResolver?: AgentRuntimeContractResolver
}

export interface BuiltContext {
  messages: RuntimeModelChatMessage[]
  systemPrompt: string
  systemMessages: RuntimeModelChatMessage[]
  debugParts: CompiledPromptPreview['debugParts']
}

const GLOBAL_CAPABILITY_DISCOVERY_POLICY = [
  'Capability discovery is a first-class runtime behavior.',
  'Before claiming a needed capability, skill, or tool is missing, inspect the available tool catalog in the current context.',
  'If the current tools are insufficient and agent catalog tools are available, call movscript_list_agent_bundles to discover relevant bundles, then movscript_inspect_agent_bundle for the best candidate.',
  'If enabling a bundle is needed, call movscript_enable_agent_bundle with the specific bundle id and let the runtime approval policy decide whether it may be enabled.',
  'After a bundle is enabled or catalog files may have changed, call movscript_reload_agent_catalog before retrying the task.',
  'Do not imply that a bundle, skill, tool, backend write, generation job, or cost-bearing action was enabled or applied until the relevant tool result proves it.',
  'If catalog tools are not available, say that dynamic capability loading is not available in this run and continue with the best available tools.',
].join('\n')

export function buildContext(input: ContextBuilderInput): BuiltContext {
  const debugParts: CompiledPromptPreview['debugParts'] = []
  const command = input.command ?? parseAgentCommand(input.userMessage)
  const contractResolver = input.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
  const runtimeContract = contractResolver.find(input.manifest)

  // --- Global Policy ---
  debugParts.push({
    id: 'policy.capability-discovery',
    kind: 'policy',
    title: 'Global Capability Policy',
    content: GLOBAL_CAPABILITY_DISCOVERY_POLICY,
  })

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
    ].filter(Boolean).join('\n'),
  })

  // --- Identity ---
  const identityLines = [
    'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
    'Answer in the same language as the user unless they ask otherwise.',
    'Use the runtime context, tool results, and startup memories when available.',
    'Startup memories are intentionally small. When older preferences, decisions, warnings, project references, or draft notes may matter, call movscript_search_memories (with or without a query) instead of assuming all memories are present.',
    'When context is missing or ambiguous and guessing would affect the outcome, call movscript_request_user_input with a clear title, short summary, and 2-4 concrete choices or a free-form question.',
    'When reading context, decide from titles, summaries, labels, descriptions, and user-facing names first. Treat tool references as references for tool calls, not as the primary meaning of the context.',
    'When several independent read tools are needed for the same step, request them in the same model turn so the runtime can execute them concurrently.',
    'Do not claim you changed project data unless a tool result proves it.',
    'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
    'Final responses must leave durable handoff anchors for future turns: created or modified artifact references such as draftId, proposalRef, projectId, and productionId; current artifact status; key decisions; unresolved questions; and the exact object future edits should continue from. Do not dump raw tool traces; preserve only user-relevant conclusions and stable references.',
    'Think in business terms: project, production, episode orchestration segment, scene moment, creative material, asset need, shot, and review draft. Treat segment as an internal emotional, rhythm, or dramatic-function phase of an episode, not as a script paragraph or plot summary. Avoid exposing runtime field names unless a tool result or approval requires them.',
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
  const topLevelPolicyParts = debugParts.filter((part) => part.id === 'policy.capability-discovery')
  const primaryContextParts = debugParts.filter((part) => part.id === 'context.summary' || part.id === 'context.memories')
  const otherParts = debugParts.filter((part) => part.id !== 'policy.capability-discovery' && part.id !== 'context.summary' && part.id !== 'context.memories')
  const systemMessages: RuntimeModelChatMessage[] = [
    ...topLevelPolicyParts.map((part) => ({
      role: 'system' as const,
      content: `## ${part.title}\n${part.content}`,
    })),
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

export function buildOpenAIChatTools(
  catalog: ResolvedToolCatalog,
  contract?: ReturnType<AgentRuntimeContractResolver['find']>,
): RuntimeModelChatTool[] {
  return catalog.available.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(resolveOpenAIToolParameters(tool, contract) ? { parameters: resolveOpenAIToolParameters(tool, contract) } : {}),
    },
  }))
}

function resolveOpenAIToolParameters(
  tool: ResolvedToolCatalog['available'][number],
  contract?: ReturnType<AgentRuntimeContractResolver['find']>,
): unknown {
  if (contract?.toolSchemas?.[tool.name] !== undefined) return contract.toolSchemas[tool.name]
  if (tool.inputSchema !== undefined) return tool.inputSchema
  if (tool.name === 'movscript_request_user_input') return USER_INPUT_TOOL_SCHEMA
  if (tool.name === 'movscript_search_memories') return SEARCH_MEMORIES_TOOL_SCHEMA
  if (tool.name === 'movscript_get_memory') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_create_memory') return CREATE_MEMORY_TOOL_SCHEMA
  if (tool.name === 'movscript_delete_memory') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_create_draft') return CREATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_get_draft') return DRAFT_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_update_draft') return UPDATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_read_draft') return DRAFT_FILE_PATH_TOOL_SCHEMA
  if (tool.name === 'movscript_list_agent_bundles') return EMPTY_OBJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_inspect_agent_bundle') return AGENT_BUNDLE_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_enable_agent_bundle') return ENABLE_AGENT_BUNDLE_TOOL_SCHEMA
  if (tool.name === 'movscript_reload_agent_catalog') return EMPTY_OBJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_project') return CREATE_PROJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_script') return CREATE_SCRIPT_TOOL_SCHEMA
  return undefined
}

const EMPTY_OBJECT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} satisfies Record<string, unknown>

const AGENT_BUNDLE_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bundleId: {
      type: 'string',
      description: 'Agent capability bundle id.',
    },
  },
  required: ['bundleId'],
} satisfies Record<string, unknown>

const ENABLE_AGENT_BUNDLE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bundleId: {
      type: 'string',
      description: 'Agent capability bundle id to enable.',
    },
    replace: {
      type: 'boolean',
      description: 'When true, replace the active bundle set with only this bundle.',
    },
  },
  required: ['bundleId'],
} satisfies Record<string, unknown>

const CREATE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'content'],
  properties: {
    kind: {
      type: 'string',
      enum: ['script_split_proposal', 'script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'asset_proposal', 'project_proposal', 'production_proposal', 'content_unit_proposal', 'content_unit_media_proposal'],
    },
    title: { type: 'string', description: 'Optional. Auto-generated from kind + project when omitted for proposal drafts.' },
    content: { type: 'string', description: 'Draft content. Prefer valid JSON for structured drafts.' },
    projectId: { type: 'number' },
    productionId: { type: 'number', description: 'Optional hint for production_proposal drafts.' },
    source: { type: 'object', additionalProperties: true },
    target: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
    proposal: { type: 'boolean', description: 'When true, creates a reviewable proposal draft: adds schema validation, infers target/source, sets default title, and returns {proposalRef, draftId, status}.' },
  },
} satisfies Record<string, unknown>

const DRAFT_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftId'],
  properties: {
    draftId: { type: 'string' },
  },
} satisfies Record<string, unknown>

const UPDATE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftId'],
  properties: {
    draftId: { type: 'string' },
    action: {
      type: 'string',
      enum: ['replace_fields', 'replace_content', 'patch_content', 'replace_text', 'set_status', 'validate', 'preview_apply'],
      description: 'Single draft operation to perform.',
    },
    status: { type: 'string', enum: ['draft', 'accepted', 'rejected', 'applied', 'superseded'] },
    title: { type: 'string' },
    content: { type: 'string', description: 'Full replacement content for the draft.' },
    target: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
    rejectedReason: { type: 'string' },
    expectedUpdatedAt: { type: 'string' },
    oldString: { type: 'string', description: 'For replace_text.' },
    newString: { type: 'string', description: 'For replace_text.' },
    replaceAll: { type: 'boolean', description: 'For replace_text.' },
    previewApply: { type: 'boolean', description: 'Shortcut for action=preview_apply.' },
    validateOnly: { type: 'boolean', description: 'Shortcut for action=validate.' },
    ops: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'path'],
        properties: {
          op: { type: 'string', enum: ['add', 'replace', 'remove'] },
          path: { type: 'string', description: 'JSON Pointer path inside the draft content JSON.' },
          value: {},
        },
      },
    },
    targetEntityType: { type: 'string' },
    targetEntityId: { type: ['string', 'number'] },
    targetField: { type: 'string' },
    currentValue: {},
    proposedValue: {},
  },
} satisfies Record<string, unknown>

const DRAFT_FILE_PATH_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file_path'],
  properties: {
    file_path: { type: 'string', description: 'Absolute draft file path returned by draft listings or read results.' },
    draft_id: { type: 'string', description: 'Compatibility alias for file_path when the runtime can resolve a draft id to a file path.' },
    draftId: { type: 'string', description: 'Compatibility alias for draft_id.' },
  },
} satisfies Record<string, unknown>

const SEARCH_MEMORIES_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description: 'Focused keywords or a short phrase to search memory titles and content in the current project.',
    },
    kind: {
      type: 'string',
      enum: ['preference', 'fact', 'item_ref', 'entity_ref', 'draft', 'decision', 'warning'],
      description: 'Optional memory kind filter.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 25,
      description: 'Maximum number of memories to return.',
    },
  },
} satisfies Record<string, unknown>

const MEMORY_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      description: 'Memory id returned by list_memories or search_memories.',
    },
    memoryId: {
      type: 'string',
      description: 'Compatibility alias for id.',
    },
  },
} satisfies Record<string, unknown>

const CREATE_MEMORY_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'kind', 'content'],
  properties: {
    title: {
      type: 'string',
      description: 'Short title shown in the memory list.',
    },
    kind: {
      type: 'string',
      enum: ['preference', 'fact', 'item_ref', 'entity_ref', 'draft', 'decision', 'warning'],
    },
    content: {
      type: 'string',
      description: 'Full memory body. Keep it concise and factual.',
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
    projectId: { type: 'number', description: 'Current project reference. The runtime fills this when a project is selected.' },
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
