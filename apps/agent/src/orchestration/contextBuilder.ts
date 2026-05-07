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

export function buildContext(input: ContextBuilderInput): BuiltContext {
  const debugParts: CompiledPromptPreview['debugParts'] = []
  const command = input.command ?? parseAgentCommand(input.userMessage)
  const contractResolver = input.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
  const runtimeContract = contractResolver.find(input.manifest)

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
    'Startup memories are intentionally small. When older preferences, decisions, warnings, project references, or draft notes may matter, call movscript_search_memories with a focused query instead of assuming all memories are present.',
    'When context is missing or ambiguous and guessing would affect the outcome, call movscript_request_user_input with a clear title, short summary, and 2-4 concrete choices or a free-form question.',
    'When reading context, decide from titles, summaries, labels, descriptions, and user-facing names first. Treat tool references as references for tool calls, not as the primary meaning of the context.',
    'When several independent read tools are needed for the same step, request them in the same model turn so the runtime can execute them concurrently.',
    'Do not claim you changed project data unless a tool result proves it.',
    'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
    'Think in business terms: project, production, segment, scene beat, creative material, asset need, shot, and review draft. Avoid exposing runtime field names unless a tool result or approval requires them.',
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
  if (tool.name === 'movscript_search_items') return SEARCH_ITEMS_TOOL_SCHEMA
  if (tool.name === 'movscript_read_item') return READ_ITEM_TOOL_SCHEMA
  if (tool.name === 'movscript_request_user_input') return USER_INPUT_TOOL_SCHEMA
  if (tool.name === 'movscript_search_memories') return SEARCH_MEMORIES_TOOL_SCHEMA
  if (tool.name === 'movscript_create_draft') return CREATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_get_draft') return DRAFT_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_update_draft') return UPDATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_patch_draft') return PATCH_DRAFT_TOOL_SCHEMA
  if (tool.name === 'movscript_validate_draft') return DRAFT_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_list_productions') return LIST_PRODUCTIONS_TOOL_SCHEMA
  if (tool.name === 'movscript_read_production_context') return READ_PRODUCTION_CONTEXT_TOOL_SCHEMA
  if (tool.name === 'movscript_check_proposal_conflicts') return CHECK_PROPOSAL_CONFLICTS_TOOL_SCHEMA
  if (tool.name === 'movscript_create_production_proposal') return CREATE_PRODUCTION_PROPOSAL_TOOL_SCHEMA
  if (tool.name === 'movscript_inspect_production_proposal_context') return INSPECT_PRODUCTION_PROPOSAL_CONTEXT_TOOL_SCHEMA
  if (tool.name === 'movscript_get_production_proposal') return PRODUCTION_PROPOSAL_DRAFT_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_scene_moment') return UPSERT_PROPOSAL_SCENE_MOMENT_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_reference') return UPSERT_PROPOSAL_REFERENCE_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_asset') return UPSERT_PROPOSAL_ASSET_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_keyframe') return UPSERT_PROPOSAL_KEYFRAME_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_proposal_shot') return UPSERT_PROPOSAL_SHOT_TOOL_SCHEMA
  if (tool.name === 'movscript_list_production_proposal_nodes') return LIST_PRODUCTION_PROPOSAL_NODES_TOOL_SCHEMA
  if (tool.name === 'movscript_upsert_production_proposal_node') return UPSERT_PRODUCTION_PROPOSAL_NODE_TOOL_SCHEMA
  if (tool.name === 'movscript_delete_production_proposal_node') return DELETE_PRODUCTION_PROPOSAL_NODE_TOOL_SCHEMA
  if (tool.name === 'movscript_create_production_proposal_from_items') return CREATE_PRODUCTION_PROPOSAL_FROM_ITEMS_TOOL_SCHEMA
  if (tool.name === 'movscript_create_project') return CREATE_PROJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_script') return CREATE_SCRIPT_TOOL_SCHEMA
  if (tool.inputSchema !== undefined) return tool.inputSchema
  return undefined
}

const SEARCH_ITEMS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description: 'Focused keywords or a short phrase to search business items.',
    },
    projectId: {
      type: 'number',
      description: 'Optional project reference id. Defaults to the current project when available.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 25,
      description: 'Maximum number of items to return.',
    },
  },
  required: ['query'],
} satisfies Record<string, unknown>

const READ_ITEM_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    itemType: {
      type: 'string',
      description: 'Business item type, such as project, production, script, creative_reference, asset_slot, segment, scene_moment, content_unit, or keyframe.',
    },
    itemId: {
      type: 'number',
      description: 'Business item reference id.',
    },
    projectId: {
      type: 'number',
      description: 'Optional project reference id. Defaults to the current project when available.',
    },
  },
  required: ['itemType', 'itemId'],
} satisfies Record<string, unknown>

const CREATE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'title', 'content'],
  properties: {
    kind: {
      type: 'string',
      enum: ['script_split', 'script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'production_proposal'],
    },
    title: { type: 'string' },
    content: { type: 'string', description: 'Draft content. Prefer valid JSON for structured drafts.' },
    projectId: { type: 'number' },
    source: { type: 'object', additionalProperties: true },
    target: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
  },
} satisfies Record<string, unknown>

const DRAFT_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftRef'],
  properties: {
    draftRef: { type: 'string', description: 'Draft reference.' },
    draftId: { type: 'string', description: 'Compatibility alias for draftRef.' },
  },
} satisfies Record<string, unknown>

const UPDATE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftRef'],
  properties: {
    draftRef: { type: 'string', description: 'Draft reference.' },
    draftId: { type: 'string', description: 'Compatibility alias for draftRef.' },
    title: { type: 'string' },
    content: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'accepted', 'rejected', 'applied', 'superseded'] },
    target: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
  },
} satisfies Record<string, unknown>

const PATCH_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftRef', 'ops'],
  properties: {
    draftRef: { type: 'string', description: 'Draft reference.' },
    draftId: { type: 'string', description: 'Compatibility alias for draftRef.' },
    expectedUpdatedAt: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'path'],
        properties: {
          op: { type: 'string', enum: ['add', 'replace', 'remove'] },
          path: { type: 'string', description: 'JSON Pointer path, for example /episode_drafts/0/summary.' },
          value: {},
        },
      },
    },
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

const PROPOSAL_ACTION_SCHEMA = {
  type: 'string',
  enum: ['create', 'reuse', 'update'],
  description: 'create suggests new business work, reuse links an existing business item by reference, update proposes a reviewed change to an existing business item.',
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
    kind: { type: 'string', description: 'section, scene, montage, narration, product_showcase, title_card, transition, or another segment kind.' },
    summary: { type: 'string' },
    order: { type: 'number' },
    status: { type: 'string' },
    rationale: { type: 'string' },
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

const CHECK_PROPOSAL_CONFLICTS_TOOL_SCHEMA = {
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
    scope: {
      type: 'string',
      enum: ['production', 'project'],
      description: 'Use project when checking creative materials or asset needs shared across productions.',
    },
    proposal: PRODUCTION_PROPOSAL_TREE_SCHEMA,
  },
} satisfies Record<string, unknown>

const PRODUCTION_PROPOSAL_NODE_TYPE_SCHEMA = {
  type: 'string',
  enum: ['segment', 'scene_moment', 'content_unit', 'creative_reference', 'asset_slot', 'keyframe'],
} satisfies Record<string, unknown>

const PRODUCTION_PROPOSAL_DRAFT_ID_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
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
    analysisScope: {
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
    nodeType: PRODUCTION_PROPOSAL_NODE_TYPE_SCHEMA,
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

const LIST_PRODUCTION_PROPOSAL_NODES_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    nodeType: PRODUCTION_PROPOSAL_NODE_TYPE_SCHEMA,
    parentClientId: {
      type: 'string',
      description: 'Optional parent local reference filter.',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 300,
    },
  },
} satisfies Record<string, unknown>

const UPSERT_PRODUCTION_PROPOSAL_NODE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'nodeType', 'node'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    nodeType: PRODUCTION_PROPOSAL_NODE_TYPE_SCHEMA,
    parent: {
      type: 'object',
      additionalProperties: false,
      description: 'Required for non-segment nodes. scene_moment parent is a segment; content_unit, creative_reference, and asset_slot parent is a scene_moment.',
      properties: {
        id: { type: 'number' },
        client_id: { type: 'string' },
        path: { type: 'string' },
      },
    },
    node: {
      type: 'object',
      additionalProperties: true,
      description: 'One proposal node. Include action create/reuse/update; include id for reuse/update; include client_id for stable local references.',
    },
    position: {
      type: 'number',
      minimum: 0,
      description: 'Optional insertion index when creating a new node.',
    },
  },
} satisfies Record<string, unknown>

const DELETE_PRODUCTION_PROPOSAL_NODE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalRef', 'nodeType'],
  properties: {
    proposalRef: { type: 'string', description: 'Proposal reference returned when the review proposal was created.' },
    draftId: { type: 'string', description: 'Compatibility alias for proposalRef.' },
    nodeType: PRODUCTION_PROPOSAL_NODE_TYPE_SCHEMA,
    id: {
      type: 'number',
      description: 'Backend business item id for reuse/update nodes.',
    },
    client_id: {
      type: 'string',
      description: 'Stable local client id for draft nodes.',
    },
    path: {
      type: 'string',
      description: 'Optional JSON path returned by list_production_proposal_nodes.',
    },
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
    analysisScope: {
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
      description: 'Focused keywords or a short phrase to search in memory content.',
    },
    scope: {
      type: 'string',
      enum: ['global', 'project', 'thread'],
      description: 'Optional scope filter. Omit to search visible global, current project, and current thread memories.',
    },
    kind: {
      type: 'string',
      enum: ['preference', 'fact', 'item_ref', 'draft', 'decision', 'warning'],
      description: 'Optional memory kind filter. Prefer item_ref for remembered project-item references.',
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
