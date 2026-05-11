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
    'Startup memories are intentionally small. When older preferences, decisions, warnings, project references, or draft notes may matter, call movscript_list_memories or movscript_search_memories with a focused query instead of assuming all memories are present.',
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
  if (tool.name === 'movscript_list_memories') return LIST_MEMORIES_TOOL_SCHEMA
  if (tool.name === 'movscript_search_memories') return SEARCH_MEMORIES_TOOL_SCHEMA
  if (tool.name === 'movscript_get_memory') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_create_memory') return CREATE_MEMORY_TOOL_SCHEMA
  if (tool.name === 'movscript_delete_memory') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_create_draft') return CREATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_proposal') return CREATE_PROPOSAL_TOOL_SCHEMA
  if (tool.name === 'movscript_submit_script_split_draft') return SCRIPT_SPLIT_SUBMIT_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_read_draft') return DRAFT_FILE_PATH_TOOL_SCHEMA
  if (tool.name === 'movscript_edit_draft') return EDIT_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_dry_apply_draft') return DRY_APPLY_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_list_agent_bundles') return EMPTY_OBJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_inspect_agent_bundle') return AGENT_BUNDLE_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_enable_agent_bundle') return ENABLE_AGENT_BUNDLE_TOOL_SCHEMA
  if (tool.name === 'movscript_reload_agent_catalog') return EMPTY_OBJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_list_productions') return LIST_PRODUCTIONS_TOOL_SCHEMA
  if (tool.name === 'movscript_read_current_production') return READ_CURRENT_PRODUCTION_TOOL_SCHEMA
  if (tool.name === 'movscript_read_production_context') return READ_PRODUCTION_CONTEXT_TOOL_SCHEMA
  if (tool.name === 'movscript_build_orchestration_diff') return BUILD_ORCHESTRATION_DIFF_TOOL_SCHEMA
  if (tool.name === 'movscript_check_proposal_is_available') return CHECK_PROPOSAL_IS_AVAILABLE_TOOL_SCHEMA
  if (tool.name === 'movscript_create_production_proposal') return CREATE_PRODUCTION_PROPOSAL_TOOL_SCHEMA
  if (tool.name === 'movscript_inspect_production_proposal_context') return INSPECT_PRODUCTION_PROPOSAL_CONTEXT_TOOL_SCHEMA
  if (tool.name === 'movscript_get_production_proposal') return PRODUCTION_PROPOSAL_DRAFT_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_preview_production_proposal_apply') return PREVIEW_PRODUCTION_PROPOSAL_APPLY_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_segment') return UPSERT_PROPOSAL_SEGMENT_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_scene_moment') return UPSERT_PROPOSAL_SCENE_MOMENT_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_reference') return UPSERT_PROPOSAL_REFERENCE_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_asset') return UPSERT_PROPOSAL_ASSET_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_content_unit') return UPSERT_PROPOSAL_CONTENT_UNIT_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_keyframe') return UPSERT_PROPOSAL_KEYFRAME_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_shot') return UPSERT_PROPOSAL_SHOT_TOOL_SCHEMA
  if (tool.name === 'movscript_submit_production_proposal') return CREATE_PRODUCTION_PROPOSAL_FROM_ITEMS_TOOL_SCHEMA
  if (tool.name === 'movscript_create_production_proposal_from_items') return CREATE_PRODUCTION_PROPOSAL_FROM_ITEMS_TOOL_SCHEMA
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
  required: ['kind', 'title', 'content'],
  properties: {
    kind: {
      type: 'string',
      enum: ['script_split', 'script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'asset_proposal', 'project_proposal', 'production_proposal'],
    },
    title: { type: 'string' },
    content: { type: 'string', description: 'Draft content. Prefer valid JSON for structured drafts.' },
    projectId: { type: 'number' },
    source: { type: 'object', additionalProperties: true },
    target: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
  },
} satisfies Record<string, unknown>

const CREATE_PROPOSAL_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'content'],
  properties: {
    kind: {
      type: 'string',
      enum: ['script_split', 'script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'asset_proposal', 'project_proposal', 'production_proposal'],
    },
    title: { type: 'string' },
    content: { type: 'string', description: 'Proposal body. Use text or JSON stringified content.' },
    projectId: { type: 'number' },
    target: { type: 'object', additionalProperties: true },
    source: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
    productionId: { type: 'number', description: 'Optional hint for production_proposal drafts.' },
  },
} satisfies Record<string, unknown>

const SCRIPT_SPLIT_SOURCE_SCRIPT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lineCount'],
  properties: {
    title: { type: 'string', description: 'Source script title only. Do not include source body text.' },
    summary: { type: 'string', description: 'Short source-level summary. Do not include source body text.' },
    sourceType: { type: 'string', enum: ['raw'], description: 'Always raw for line-number based splitting.' },
    lineCount: { type: 'number', minimum: 1, description: 'Total number of numbered source lines. This is the only source-body reference allowed.' },
  },
} satisfies Record<string, unknown>

const SCRIPT_SPLIT_GLOBAL_SETTINGS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    storyWorld: { type: 'string' },
    coreRules: { type: 'array', items: { type: 'string' } },
    characterRelationships: { type: 'array', items: { type: 'string' } },
    keyCharacters: { type: 'array', items: { type: 'string' } },
    keyLocations: { type: 'array', items: { type: 'string' } },
    keyProps: { type: 'array', items: { type: 'string' } },
    continuityNotes: { type: 'array', items: { type: 'string' } },
  },
} satisfies Record<string, unknown>

const SCRIPT_SPLIT_GLOBAL_CONTEXT_TOOL_SCHEMA = {
  ...SCRIPT_SPLIT_GLOBAL_SETTINGS_TOOL_SCHEMA,
  properties: {
    ...SCRIPT_SPLIT_GLOBAL_SETTINGS_TOOL_SCHEMA.properties,
    episodeRelevance: { type: 'array', items: { type: 'string' } },
  },
} satisfies Record<string, unknown>

const SCRIPT_SPLIT_EPISODE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['startLine', 'endLine'],
  properties: {
    order: { type: 'number', description: 'Optional. Defaults to the episode range order in this array.' },
    title: { type: 'string', description: 'Episode title. Do not include body text.' },
    summary: { type: 'string', description: 'Short episode summary. Do not include body text or copied original lines.' },
    globalContext: SCRIPT_SPLIT_GLOBAL_CONTEXT_TOOL_SCHEMA,
    startLine: { type: 'number', minimum: 1, description: 'First source line included in this episode. Use line numbers only; do not pass body text.' },
    endLine: { type: 'number', minimum: 1, description: 'Last source line included in this episode. Use line numbers only; do not pass body text.' },
    action: { type: 'string', enum: ['create', 'update'] },
    existingScriptId: { type: ['number', 'null'] },
    productionAction: { type: 'string', enum: ['create', 'update', 'skip'] },
    existingProductionId: { type: ['number', 'null'] },
    productionTitle: { type: 'string', description: 'Title for the production decision. Do not include body text.' },
    productionSummary: { type: 'string', description: 'Short production summary. Focus on the script segment this production should cover.' },
  },
} satisfies Record<string, unknown>

const SCRIPT_SPLIT_SUBMIT_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'sourceTitle', 'lineCount', 'episodeDrafts'],
  properties: {
    projectId: { type: 'number' },
    draftTitle: { type: 'string' },
    sourceTitle: { type: 'string', description: 'Source script title only. Do not include script body.' },
    sourceSummary: { type: 'string', description: 'Short source-level summary. Do not include script body.' },
    lineCount: { type: 'number', minimum: 1, description: 'Total number of numbered source lines.' },
    sourceScript: SCRIPT_SPLIT_SOURCE_SCRIPT_TOOL_SCHEMA,
    globalSettings: SCRIPT_SPLIT_GLOBAL_SETTINGS_TOOL_SCHEMA,
    episodeDrafts: {
      type: 'array',
      minItems: 1,
      items: SCRIPT_SPLIT_EPISODE_DRAFT_TOOL_SCHEMA,
      description: 'Each episode provides metadata and startLine/endLine. Never include content, text, body, or original lines. Each episode also carries a production decision.',
    },
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
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

const EDIT_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file_path', 'old_string', 'new_string'],
  properties: {
    file_path: { type: 'string', description: 'Absolute draft file path.' },
    draft_id: { type: 'string', description: 'Compatibility alias for file_path when the runtime can resolve a draft id to a file path.' },
    draftId: { type: 'string', description: 'Compatibility alias for draft_id.' },
    old_string: { type: 'string', description: 'Exact text to replace. It must match uniquely unless replace_all is true.' },
    new_string: { type: 'string', description: 'Replacement text. It must differ from old_string.' },
    replace_all: { type: 'boolean', description: 'When true, replace every occurrence of old_string.' },
  },
} satisfies Record<string, unknown>

const DRY_APPLY_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file_path'],
  properties: {
    file_path: { type: 'string', description: 'Absolute draft file path.' },
    draft_id: { type: 'string', description: 'Compatibility alias for file_path when the runtime can resolve a draft id to a file path.' },
    draftId: { type: 'string', description: 'Compatibility alias for draft_id.' },
    target: { type: 'object', additionalProperties: true },
    targetEntityType: { type: 'string' },
    targetEntityId: { type: ['number', 'string'] },
    targetField: { type: 'string' },
    currentValue: {},
    current_value: {},
    proposedValue: {},
    proposed_value: {},
  },
} satisfies Record<string, unknown>

const LIST_PRODUCTIONS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference. The runtime usually fills this from UI context.',
    },
    status: {
      type: 'string',
      description: 'Optional production status filter.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 100,
    },
  },
} satisfies Record<string, unknown>

const READ_PRODUCTION_CONTEXT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productionId'],
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference. The runtime usually fills this from UI context.',
    },
    productionId: {
      type: 'number',
      description: 'Business reference for the production/episode currently being prepared.',
    },
    includeScriptText: {
      type: 'boolean',
      description: 'Whether to include linked script text when available. Defaults to true.',
    },
    includeExistingEntities: {
      type: 'boolean',
      description: 'Whether to include existing business items such as segments, scene beats, shots, creative materials, and asset needs. Defaults to true.',
    },
  },
} satisfies Record<string, unknown>

const READ_CURRENT_PRODUCTION_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference. The runtime usually fills this from UI context.',
    },
    productionId: {
      type: 'number',
      description: 'Selected production/episode reference. Defaults to the current UI production when omitted.',
    },
    includeScriptText: {
      type: 'boolean',
      description: 'Whether to include linked script text when available. Defaults to true.',
    },
  },
} satisfies Record<string, unknown>

const PROPOSAL_ACTION_SCHEMA = {
  type: 'string',
  enum: ['create', 'reuse', 'update'],
  description: 'create suggests new business work, reuse links an existing business item by reference, update proposes a reviewed change to an existing business item.',
} satisfies Record<string, unknown>

const PROPOSAL_DIFF_ACTION_SCHEMA = {
  type: 'string',
  enum: ['create', 'reuse', 'update', 'keep', 'ignore', 'supersede'],
  description: 'Review-level decision from comparing agent-derived requirements with existing production and draft state. Confirmed entities should normally be keep, reuse, or additive create.',
} satisfies Record<string, unknown>

const PROPOSAL_REF_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'name'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Business reference for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference for this proposal item.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    name: { type: 'string' },
    kind: { type: 'string', description: 'character, location, prop, product, brand, style, world_rule, or another project-specific kind.' },
    role: { type: 'string', description: 'How the reference is used in this scene moment.' },
    requirement_ref: { type: 'string', description: 'Stable reference to the setting requirement this node satisfies.' },
    coverage_status: { type: 'string', enum: ['covered', 'partial', 'missing', 'conflict'], description: 'Whether current project settings already cover this production requirement.' },
    diff_action: PROPOSAL_DIFF_ACTION_SCHEMA,
    source_evidence: { type: 'string', description: 'Short source clue from script, brief, user request, or current entity that justifies the node.' },
    rationale: { type: 'string', description: 'Why this setting should be reused, created, or updated for the scene moment.' },
    state: {
      type: 'object',
      additionalProperties: false,
      properties: {
        costume: { type: 'string' },
        emotion: { type: 'string' },
        props: { type: 'string' },
        visual_notes: { type: 'string' },
      },
    },
  },
} satisfies Record<string, unknown>

const PROPOSAL_ASSET_SLOT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'name'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Business reference for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference for this proposal item.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    name: { type: 'string' },
    kind: { type: 'string', description: 'image, video, audio, text, reference, prop, costume, location, or another project-specific kind.' },
    description: { type: 'string' },
    priority: { type: 'string', description: 'missing, high, medium, low, candidate, or project-specific priority.' },
    requirement_ref: { type: 'string', description: 'Stable reference to the asset requirement this slot satisfies.' },
    coverage_status: { type: 'string', enum: ['covered', 'partial', 'missing', 'conflict'], description: 'Whether current asset slots already cover this asset requirement.' },
    diff_action: PROPOSAL_DIFF_ACTION_SCHEMA,
    source_evidence: { type: 'string', description: 'Short source clue from script, brief, setting state, or scene moment that justifies the asset need.' },
    rationale: { type: 'string', description: 'Why this asset need should be reused, created, or updated.' },
  },
} satisfies Record<string, unknown>

const PROPOSAL_CONTENT_UNIT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'title'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Business reference for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference for this proposal item.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    title: { type: 'string' },
    kind: { type: 'string', description: 'shot, visual_segment, product_showcase, caption_card, narration, transition, music_beat, or another production unit kind.' },
    description: { type: 'string' },
    shot_size: { type: 'string' },
    camera_angle: { type: 'string' },
    duration_sec: { type: 'number' },
    order: { type: 'number' },
    status: { type: 'string' },
  },
} satisfies Record<string, unknown>

const PROPOSAL_SCENE_MOMENT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'title'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Business reference for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference used by child shots, materials, and asset needs.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    title: { type: 'string' },
    time_text: { type: 'string' },
    location_text: { type: 'string' },
    action_text: { type: 'string' },
    mood: { type: 'string' },
    description: { type: 'string' },
    order: { type: 'number' },
    status: { type: 'string' },
    rationale: { type: 'string' },
    expression_goal: { type: 'string', description: 'What situation, information, relationship shift, or emotion this scene moment must express.' },
    requirement_ref: { type: 'string', description: 'Stable reference to the scene-moment derivation requirement.' },
    coverage_status: { type: 'string', enum: ['covered', 'partial', 'missing', 'conflict'], description: 'Whether existing scene moments already cover this derived situation.' },
    diff_action: PROPOSAL_DIFF_ACTION_SCHEMA,
    source_evidence: { type: 'string', description: 'Short source clue from script, brief, or current production that justifies the scene moment.' },
    content_units: {
      type: 'array',
      items: PROPOSAL_CONTENT_UNIT_SCHEMA,
    },
    creative_references: {
      type: 'array',
      items: PROPOSAL_REF_SCHEMA,
    },
    asset_slots: {
      type: 'array',
      items: PROPOSAL_ASSET_SLOT_SCHEMA,
    },
  },
} satisfies Record<string, unknown>

const PROPOSAL_SEGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'title'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Business reference for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference used by scene beats in this proposal.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    title: { type: 'string' },
    kind: { type: 'string', description: 'emotional_function, rhythm_shift, dramatic_function, setup, escalation, release, reversal, transition, or another episode orchestration segment kind.' },
    summary: { type: 'string', description: 'This segment’s emotional/rhythm/dramatic function inside the episode. Do not use it as a script paragraph summary or scene synopsis.' },
    order: { type: 'number' },
    status: { type: 'string' },
    rationale: { type: 'string' },
    expression_goal: { type: 'string', description: 'The emotional, rhythm, or dramatic-function purpose this segment serves in the production.' },
    requirement_ref: { type: 'string', description: 'Stable reference to the segment rhythm requirement.' },
    coverage_status: { type: 'string', enum: ['covered', 'partial', 'missing', 'conflict'], description: 'Whether existing segments already cover this derived rhythm/function.' },
    diff_action: PROPOSAL_DIFF_ACTION_SCHEMA,
    source_evidence: { type: 'string', description: 'Short source clue from script, brief, or current production that justifies the segment.' },
    scene_moments: {
      type: 'array',
      items: PROPOSAL_SCENE_MOMENT_SCHEMA,
    },
  },
} satisfies Record<string, unknown>

const PRODUCTION_PROPOSAL_TREE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      minItems: 1,
      items: PROPOSAL_SEGMENT_SCHEMA,
    },
  },
} satisfies Record<string, unknown>

const BUILD_ORCHESTRATION_DIFF_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productionId', 'proposal'],
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference. The runtime usually fills this from UI context.',
    },
    productionId: {
      type: 'number',
      description: 'Business reference for the production/episode currently being prepared.',
    },
    proposal: {
      ...PRODUCTION_PROPOSAL_TREE_SCHEMA,
      description: 'Agent-derived orchestration tree before it is written to a draft. Include segment rhythm, scene moments, content-unit storyboard beats, keyframe intent, setting usage, and asset needs.',
    },
    currentDraft: {
      ...PRODUCTION_PROPOSAL_TREE_SCHEMA,
      description: 'Optional current local draft tree. When omitted, the tool compares only against formal production context.',
    },
  },
} satisfies Record<string, unknown>

const CHECK_PROPOSAL_IS_AVAILABLE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productionId', 'proposal'],
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference. The runtime usually fills this from UI context.',
    },
    productionId: {
      type: 'number',
      description: 'Business reference for the production/episode currently being prepared.',
    },
    autofix: {
      type: 'boolean',
      description: 'When true, the tool returns normalizedProposal with unambiguous reuse/update ids filled and duplicate create actions converted. Defaults to true.',
    },
    proposal: PRODUCTION_PROPOSAL_TREE_SCHEMA,
  },
} satisfies Record<string, unknown>

const PRODUCTION_PROPOSAL_DRAFT_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created. If omitted, the runtime uses the current page draftId when available.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef. If omitted, the runtime uses the current page draftId when available.' },
  },
} satisfies Record<string, unknown>

const CREATE_PRODUCTION_PROPOSAL_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'productionId'],
  properties: {
    projectId: {
      type: 'number',
      description: 'Current project reference.',
    },
    productionId: {
      type: 'number',
      description: 'Business reference for the production/episode this review proposal belongs to.',
    },
    proposalScope: {
      type: 'string',
      description: 'Business scope label for the UI, normally production.',
    },
    title: {
      type: 'string',
      description: 'Optional review proposal title.',
    },
    summary: {
      type: 'string',
      description: 'Optional UI-facing summary. It can be updated later.',
    },
  },
} satisfies Record<string, unknown>

const INSPECT_PRODUCTION_PROPOSAL_CONTEXT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'number' },
    productionId: { type: 'number' },
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    includeNodes: { type: 'boolean' },
    nodeType: {
      type: 'string',
      enum: ['segment', 'scene_moment', 'content_unit', 'creative_reference', 'asset_slot', 'keyframe'],
    },
  },
} satisfies Record<string, unknown>

const PREVIEW_PRODUCTION_PROPOSAL_APPLY_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'proposalRef'],
  properties: {
    projectId: { type: 'number', description: 'Current project id for backend dry-run.' },
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    productionId: { type: 'number', description: 'Optional explicit production id. The runtime usually reads this from the draft content.' },
    proposalScope: { type: 'string', description: 'Optional explicit proposal scope. The runtime usually reads this from the draft content.' },
  },
} satisfies Record<string, unknown>

const PROPOSAL_PARENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number', description: 'Business reference for an existing project item.' },
    localRef: { type: 'string', description: 'Stable local reference from the proposal tree.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    path: { type: 'string' },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_SEGMENT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'segment'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    segment: PROPOSAL_SEGMENT_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_SCENE_MOMENT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'segment', 'sceneMoment'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    segment: PROPOSAL_PARENT_SCHEMA,
    sceneMoment: PROPOSAL_SCENE_MOMENT_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_REFERENCE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'sceneMoment', 'reference'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    sceneMoment: PROPOSAL_PARENT_SCHEMA,
    reference: PROPOSAL_REF_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_ASSET_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'sceneMoment', 'asset'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    sceneMoment: PROPOSAL_PARENT_SCHEMA,
    asset: PROPOSAL_ASSET_SLOT_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_CONTENT_UNIT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'sceneMoment', 'contentUnit'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    sceneMoment: PROPOSAL_PARENT_SCHEMA,
    contentUnit: PROPOSAL_CONTENT_UNIT_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const PROPOSAL_KEYFRAME_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['action', 'title'],
  properties: {
    action: PROPOSAL_ACTION_SCHEMA,
    id: { type: 'number', description: 'Required for reuse or update.' },
    localRef: { type: 'string', description: 'Stable local reference for this keyframe.' },
    client_id: { type: 'string', description: 'Compatibility alias for localRef.' },
    title: { type: 'string' },
    description: { type: 'string' },
    prompt: { type: 'string' },
    resource_id: { type: 'number', description: 'Optional existing raw resource used as keyframe image.' },
    order: { type: 'number' },
    status: { type: 'string' },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_KEYFRAME_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'keyframe'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    sceneMoment: PROPOSAL_PARENT_SCHEMA,
    shot: PROPOSAL_PARENT_SCHEMA,
    keyframe: PROPOSAL_KEYFRAME_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const UPSERT_PROPOSAL_SHOT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'sceneMoment', 'shot'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    sceneMoment: PROPOSAL_PARENT_SCHEMA,
    shot: PROPOSAL_CONTENT_UNIT_SCHEMA,
    position: { type: 'number', minimum: 0 },
  },
} satisfies Record<string, unknown>

const CREATE_PRODUCTION_PROPOSAL_FROM_ITEMS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'productionId', 'proposal'],
  properties: {
    projectId: {
      type: 'number',
      description: 'Business reference for the current project.',
    },
    productionId: {
      type: 'number',
      description: 'Business reference for the production/episode this review proposal belongs to.',
    },
    proposalScope: {
      type: 'string',
      description: 'Scope label for the UI, normally production.',
    },
    summary: {
      type: 'string',
      description: 'One concise business-facing summary of what this proposal extracts or changes.',
    },
    proposal: PRODUCTION_PROPOSAL_TREE_SCHEMA,
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

const LIST_MEMORIES_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      enum: ['preference', 'fact', 'item_ref', 'entity_ref', 'draft', 'decision', 'warning'],
      description: 'Optional memory kind filter.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      description: 'Maximum number of memory titles to return.',
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
