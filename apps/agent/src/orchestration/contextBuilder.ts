import type { AgentManifest } from '../catalog/agentManifest.js'
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
import { renderDebugContextText, renderToolCatalogText } from '../context/contextText.js'
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
  promptStats: PromptStats
  warnings: string[]
  degraded?: 'dropped_policies' | 'dropped_workflows' | 'dropped_examples'
}

export interface PromptStats {
  totalChars: number
  parts: Array<{ id: string; title: string; kind: string; layer: PromptLayer; chars: number }>
  byLayer: Record<PromptLayer, number>
}

export type PromptLayer = 'level0_core' | 'level1_context' | 'level2_behavior' | 'retrieved_context' | 'runtime_warnings'

const CORE_RUNTIME_PROTOCOL_LINES = [
  'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
  'Answer in the same language as the user unless they ask otherwise.',
  'Tool results are the source of truth. Do not claim project data, backend writes, generation jobs, costs, skills, or tools changed unless a tool result proves it.',
  'Default context is intentionally small. Retrieve project lists, drafts, memories, schemas, resources, generation jobs, or catalog details with tools only when needed.',
  'When missing context would make the next step a guess, call movscript_request_user_input.',
  'Final responses must preserve durable handoff anchors: artifact refs such as draftId, proposalRef, projectId, productionId, status, key decisions, unresolved questions, and the object future edits should continue from.',
]

const PLANNER_SUBAGENT_POLICY = [
  'Planner/subagent orchestration is available in this run.',
  'Do simple, single-context tasks yourself as the planner instead of spawning a worker.',
  'Use movscript_spawn_subagent when work can be split into independent tasks, needs parallel execution, needs isolated context, or may take longer than one run.',
  'Each worker receives a short human-readable subagentName such as 爱因斯坦 or 霍金. You may provide one, or omit it and let the runtime assign names in order; refer to workers by that name in later wait/cancel calls instead of relying on task ids in natural language.',
  'When spawning or redispatching worker tasks, use maxWorkers for concurrency, retryFailed with maxTaskAttempts for failed/cancelled task retries, and workerTimeoutMs to cancel stale active workers before dispatching new work. Per-task maxTaskAttempts and workerTimeoutMs override the call-level defaults.',
  'After spawning workers, use movscript_list_subagents and movscript_wait_subagent to monitor structured task state, worker run status, blockers, and artifacts instead of inferring progress from natural-language chat.',
  'If movscript_wait_subagent returns pending, continue with other independent work or report that worker execution is still in progress; do not pretend the worker finished.',
  'If movscript_wait_subagent returns failed, cancelled, blocked, or needs_review, use the returned target and snapshot to decide whether to replan, spawn replacement work, cancel stale work, or ask the user for missing input.',
  'Use movscript_cancel_subagent only for stale, mistaken, duplicated, or user-cancelled worker work. It can cancel an active worker run or mark a named pending/blocked/needs_review subagent task cancelled before any worker starts.',
  'Worker subagents execute scoped tasks; the planner remains responsible for final synthesis, dependency decisions, replan decisions, and user-facing completion.',
].join('\n')

export function buildContext(input: ContextBuilderInput): BuiltContext {
  const debugParts: CompiledPromptPreview['debugParts'] = []
  const warnings = [...input.warnings]
  const command = input.command ?? parseAgentCommand(input.userMessage)
  const contractResolver = input.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
  const runtimeContract = contractResolver.find(input.manifest)

  // --- Core Runtime Protocol ---
  debugParts.push({
    id: 'runtime.core',
    kind: 'policy',
    title: 'Core Runtime Protocol',
    content: [
      ...CORE_RUNTIME_PROTOCOL_LINES,
      input.policy.sandboxMode ? 'Sandbox mode is active: write, generation, and destructive tools are intercepted and simulated.' : undefined,
      `Runtime limits: approvalMode=${input.policy.approvalMode}; maxToolCalls=${input.policy.maxToolCalls}; maxIterations=${input.policy.maxIterations}.`,
      input.manifest.soul ? `[Agent-specific output contract]\n${input.manifest.soul}` : undefined,
    ].filter(Boolean).join('\n'),
  })

  // --- Current Context Envelope ---
  debugParts.push({
    id: 'context.summary',
    kind: 'context',
    title: 'Current context',
    content: renderDebugContextText(input.context),
  })

  // --- Core Command Contract ---
  if (shouldIncludeCommandContract(command)) {
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
  }

  // --- Tool Use Principle ---
  debugParts.push({
    id: 'tools.available',
    kind: 'tool',
    title: 'Tool use',
    content: renderToolCatalogText(input.tools),
  })

  // --- Activated Behavior ---
  for (const skill of orderedActivatedSkills(input.skills)) {
    debugParts.push({
      id: `skill.${skill.id}`,
      kind: 'skill',
      title: skill.name,
      content: skill.compiledInstruction || skill.description,
    })
  }
  if (shouldIncludeSubagentPolicy(input, command)) {
    debugParts.push({
      id: 'policy.planner-subagents',
      kind: 'policy',
      title: 'Planner Subagent Policy',
      content: PLANNER_SUBAGENT_POLICY,
    })
  }

  // --- Runtime Warnings ---
  if (input.warnings.length > 0) {
    debugParts.push({
      id: 'context.warnings',
      kind: 'policy',
      title: 'Runtime warnings',
      content: input.warnings.join('\n'),
    })
  }

  const fittedPrompt = fitDebugPartsToLimit(debugParts, input.skills, systemPromptLimit(input.manifest), warnings)
  const finalDebugParts = fittedPrompt.debugParts
  const systemPrompt = renderDebugParts(finalDebugParts)
  const promptStats = buildPromptStats(finalDebugParts, systemPrompt)
  const systemMessages: RuntimeModelChatMessage[] = finalDebugParts.map((part) => ({
    role: 'system' as const,
    content: `## ${part.title}\n${part.content}`,
  }))

  const messages: RuntimeModelChatMessage[] = [
    ...systemMessages,
    ...input.history.map((msg): RuntimeModelChatMessage => ({ role: msg.role as RuntimeModelChatMessage['role'], content: msg.content })),
    { role: 'user', content: input.userMessage },
  ]

  return { messages, systemPrompt, systemMessages, debugParts: finalDebugParts, promptStats, warnings, ...(fittedPrompt.degraded ? { degraded: fittedPrompt.degraded } : {}) }
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
  if (tool.name === 'movscript_reload_agent_catalog') return EMPTY_OBJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_spawn_subagent') return SPAWN_SUBAGENT_TOOL_SCHEMA
  if (tool.name === 'movscript_list_subagents') return LIST_SUBAGENTS_TOOL_SCHEMA
  if (tool.name === 'movscript_wait_subagent') return WAIT_SUBAGENT_TOOL_SCHEMA
  if (tool.name === 'movscript_cancel_subagent') return CANCEL_SUBAGENT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_project') return CREATE_PROJECT_TOOL_SCHEMA
  if (tool.name === 'movscript_create_script') return CREATE_SCRIPT_TOOL_SCHEMA
  return undefined
}

function hasAvailableTool(tools: ResolvedToolCatalog, name: string): boolean {
  return tools.available.some((tool) => tool.name === name)
}

function shouldIncludeCommandContract(command: AgentCommandRuntime): boolean {
  if (command.name !== 'chat') return true
  return command.requiredTools.length > 0 || command.outputMode !== 'natural'
}

function shouldIncludeSubagentPolicy(input: ContextBuilderInput, command: AgentCommandRuntime): boolean {
  if (!hasAvailableTool(input.tools, 'movscript_spawn_subagent')) return false
  if (input.context.agentPlan) return true
  if (command.contextProfile === 'project_structure') return true
  return /subagent|worker|parallel|并行|子代理|多任务|拆分任务|分工/.test(input.userMessage)
}

function orderedActivatedSkills(skills: ResolvedAgentSkill[]): ResolvedAgentSkill[] {
  const kindRank = (skill: ResolvedAgentSkill): number => {
    const kind = typeof skill.metadata?.kind === 'string' ? skill.metadata.kind : skill.category
    if (kind === 'persona') return 0
    if (kind === 'policy') return 1
    if (kind === 'workflow') return 2
    return 3
  }
  return [...skills].sort((a, b) => kindRank(a) - kindRank(b) || b.resolvedPriority - a.resolvedPriority || a.id.localeCompare(b.id))
}

function buildPromptStats(debugParts: CompiledPromptPreview['debugParts'], systemPrompt: string): PromptStats {
  const byLayer: Record<PromptLayer, number> = {
    level0_core: 0,
    level1_context: 0,
    level2_behavior: 0,
    retrieved_context: 0,
    runtime_warnings: 0,
  }
  const parts = debugParts.map((part) => {
    const layer = promptLayerForPart(part)
    const chars = `## ${part.title}\n${part.content}`.length
    byLayer[layer] += chars
    return { id: part.id, title: part.title, kind: part.kind, layer, chars }
  })
  return { totalChars: systemPrompt.length, parts, byLayer }
}

function promptLayerForPart(part: CompiledPromptPreview['debugParts'][number]): PromptLayer {
  if (part.id === 'runtime.core' || part.id.startsWith('command.') || part.id === 'tools.available') return 'level0_core'
  if (part.id === 'context.summary') return 'level1_context'
  if (part.id.startsWith('skill.') || part.id === 'policy.planner-subagents') return 'level2_behavior'
  if (part.id === 'context.memories') return 'retrieved_context'
  return 'runtime_warnings'
}

const EMPTY_OBJECT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} satisfies Record<string, unknown>

const SPAWN_SUBAGENT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subagentName: { type: 'string', description: 'Optional human-readable worker subagent name, for example 爱因斯坦 or 霍金. If omitted, the runtime assigns the next ordered name.' },
    subagentNames: {
      oneOf: [
        { type: 'array', items: { type: 'string' } },
        { type: 'object', additionalProperties: { type: 'string' } },
      ],
      description: 'Optional human-readable names for existing taskIds. Use an array in the same order as taskIds, or an object mapping taskId to name. Missing names are assigned automatically.',
    },
    taskId: { type: 'string', description: 'Existing plan task id to run with a worker subagent.' },
    taskIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Existing plan task ids to run with worker subagents.',
    },
    tasks: {
      type: 'array',
      description: 'Optional new tasks to add before dispatching workers.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          subagentName: { type: 'string', description: 'Optional human-readable worker subagent name for this task. Missing names are assigned automatically.' },
          title: { type: 'string' },
          description: { type: 'string' },
          deps: { type: 'array', items: { type: 'string' } },
          parentId: { type: 'string' },
          maxTaskAttempts: { type: 'number', description: 'Optional retry attempt limit for this worker task. Overrides the dispatch default.' },
          workerTimeoutMs: { type: 'number', description: 'Optional timeout for this worker task in milliseconds. Overrides the dispatch default.' },
        },
        required: ['title'],
      },
    },
    maxWorkers: { type: 'number', description: 'Maximum concurrent worker subagents to dispatch.' },
    maxTaskAttempts: { type: 'number', description: 'Default retry attempt limit for failed worker tasks dispatched by this call. Task-level maxTaskAttempts overrides this value.' },
    retryFailed: { type: 'boolean', description: 'Whether to reset retryable failed or cancelled worker tasks before dispatching.' },
    workerTimeoutMs: { type: 'number', description: 'Default worker timeout in milliseconds. Task-level workerTimeoutMs overrides this value.' },
  },
} satisfies Record<string, unknown>

const LIST_SUBAGENTS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    planId: { type: 'string', description: 'Plan id. Defaults to the current planner run plan.' },
  },
} satisfies Record<string, unknown>

const WAIT_SUBAGENT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subagentName: { type: 'string', description: 'Human-readable worker subagent name to inspect.' },
    runId: { type: 'string', description: 'Worker run id to inspect.' },
    taskId: { type: 'string', description: 'Task id to inspect.' },
    planId: { type: 'string', description: 'Plan id to inspect. Defaults to the current planner run plan.' },
    timeoutMs: { type: 'number', description: 'Short polling timeout in milliseconds. Use 0 for immediate status.' },
  },
} satisfies Record<string, unknown>

const CANCEL_SUBAGENT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subagentName: { type: 'string', description: 'Human-readable worker subagent name to cancel. May target an active worker run or a not-yet-started task.' },
    runId: { type: 'string', description: 'Child worker run id to cancel.' },
    taskId: { type: 'string', description: 'Task id whose owner worker should be cancelled, or whose pending/blocked/needs_review task should be marked cancelled if no worker has started.' },
    reason: { type: 'string' },
  },
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

function fitDebugPartsToLimit(
  debugParts: CompiledPromptPreview['debugParts'],
  skills: ResolvedAgentSkill[],
  limit: number,
  warnings: string[],
): { debugParts: CompiledPromptPreview['debugParts']; degraded?: BuiltContext['degraded'] } {
  let current = [...debugParts]
  let degraded: BuiltContext['degraded']
  let prompt = renderDebugParts(current)
  if (prompt.length <= limit) return { debugParts: current }

  const lowPrioritySkills = current
    .filter((part) => part.kind === 'skill' && skillPriority(skills, part.id) < 100)
    .sort((a, b) => skillPriority(skills, a.id) - skillPriority(skills, b.id) || b.id.localeCompare(a.id))
  for (const skill of lowPrioritySkills) {
    current = current.filter((part) => part.id !== skill.id)
    degraded = 'dropped_policies'
    warnings.push(`prompt.size.exceeded: dropped non-critical skill ${skill.id}`)
    prompt = renderDebugParts(current)
    if (prompt.length <= limit) return { debugParts: current, degraded }
  }

  const workflowSkills = current
    .filter((part) => part.kind === 'skill')
    .sort((a, b) => skillPriority(skills, a.id) - skillPriority(skills, b.id) || b.id.localeCompare(a.id))
  for (const skill of workflowSkills) {
    current = current.filter((part) => part.id !== skill.id)
    degraded = 'dropped_workflows'
    warnings.push(`prompt.size.exceeded: dropped skill ${skill.id}`)
    prompt = renderDebugParts(current)
    if (prompt.length <= limit) return { debugParts: current, degraded }
  }

  const stripped = current.map((part) => ({ ...part, content: stripExamplesSection(part.content) }))
  const strippedPrompt = renderDebugParts(stripped)
  if (strippedPrompt.length < prompt.length) {
    current = stripped
    degraded = 'dropped_examples'
    warnings.push('prompt.size.exceeded: stripped examples sections')
    prompt = strippedPrompt
    if (prompt.length <= limit) return { debugParts: current, degraded }
  }

  throw new Error(`prompt.size.exceeded: system prompt ${prompt.length} chars exceeds limit ${limit}`)
}

function renderDebugParts(debugParts: CompiledPromptPreview['debugParts']): string {
  return debugParts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n')
}

function skillPriority(skills: ResolvedAgentSkill[], partId: string): number {
  const skillId = partId.startsWith('skill.') ? partId.slice('skill.'.length) : partId
  return skills.find((skill) => skill.id === skillId)?.resolvedPriority ?? 100
}

function systemPromptLimit(manifest: AgentManifest): number {
  const value = manifest.metadata?.systemPromptCharLimit
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 32000
}

function stripExamplesSection(content: string): string {
  return content
    .replace(/\n+examples?:[\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/gi, '\n')
    .replace(/\n+示例[:：][\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/g, '\n')
    .trim()
}

// Re-export CompiledPromptPreview-compatible output for previewRun
export function buildPromptPreview(input: ContextBuilderInput): CompiledPromptPreview {
  const { messages, systemPrompt, debugParts, promptStats } = buildContext(input)
  return {
    system: systemPrompt,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content ?? '' })),
    debugParts,
    promptStats,
  }
}
