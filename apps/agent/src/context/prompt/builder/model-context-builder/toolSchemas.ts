import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { ResolvedToolCatalog } from '../../../../state/shared/types.js'

export function resolveRuntimeToolParameters(
  tool: ResolvedToolCatalog['available'][number],
  contract?: ReturnType<AgentRuntimeContractResolver['find']>,
): unknown {
  if (contract?.toolSchemas?.[tool.name] !== undefined) return contract.toolSchemas[tool.name]
  if (tool.inputSchema !== undefined) return tool.inputSchema
  if (tool.name === 'core_user_input_request') return USER_INPUT_TOOL_SCHEMA
  if (tool.name === 'core_memory_search') return SEARCH_MEMORIES_TOOL_SCHEMA
  if (tool.name === 'core_memory_get') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'movscript_project_standards_get') return PROJECT_STANDARDS_TOOL_SCHEMA
  if (tool.name === 'reference_search') return SEARCH_REFERENCE_TOOL_SCHEMA
  if (tool.name === 'reference_get') return GET_REFERENCE_TOOL_SCHEMA
  if (tool.name === 'core_memory_create') return CREATE_MEMORY_TOOL_SCHEMA
  if (tool.name === 'core_memory_delete') return MEMORY_ID_TOOL_SCHEMA
  if (tool.name === 'draft_create') return CREATE_DRAFT_TOOL_SCHEMA
  if (tool.name === 'draft_apply_preview') return PREVIEW_DRAFT_APPLY_TOOL_SCHEMA
  if (tool.name === 'core_catalog_inspect') return INSPECT_AGENT_CATALOG_TOOL_SCHEMA
  if (tool.name === 'core_skill_update') return UPDATE_ACTIVE_SKILLS_TOOL_SCHEMA
  if (tool.name === 'core_update_plan') return UPDATE_PLAN_TOOL_SCHEMA
  if (tool.name === 'core_video_extract_frames') return VIDEO_FRAME_EXTRACT_TOOL_SCHEMA
  if (tool.name === 'movscript_project_create') return CREATE_PROJECT_TOOL_SCHEMA
  return undefined
}

const TASK_GRAPH_TASK_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Optional stable task id. Use snake_case prefixed with task_ when choosing one.' },
    title: { type: 'string' },
    description: { type: 'string' },
    deps: { type: 'array', items: { type: 'string' }, description: 'Task ids that must finish first.' },
    parentId: { type: 'string' },
    subagentName: { type: 'string', description: 'Optional human-readable worker subagent name for this task.' },
    maxTaskAttempts: { type: 'number', description: 'Optional retry attempt limit for this worker task.' },
    workerTimeoutMs: { type: 'number', description: 'Optional timeout for this worker task in milliseconds.' },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Optional structured planning metadata, e.g. executionMode, parallelizable, criticalPath, writeScope, expectedOutput, and reportFormat.',
    },
  },
  required: ['title'],
} satisfies Record<string, unknown>

const TASK_GRAPH_TASK_UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Existing task id to update.' },
    title: { type: 'string' },
    description: { type: 'string' },
    deps: { type: 'array', items: { type: 'string' } },
    parentId: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'running', 'blocked', 'needs_review', 'done', 'failed', 'cancelled'] },
    progress: { type: 'number' },
    blockedReason: { type: 'string' },
    subagentName: { type: 'string' },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Optional structured planning metadata patch.',
    },
  },
  required: ['id'],
} satisfies Record<string, unknown>

const INSPECT_AGENT_CATALOG_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    view: {
      type: 'string',
      enum: ['summary', 'pack', 'skill', 'tool', 'config'],
      description: 'Catalog view to inspect. Defaults to summary.',
    },
    id: {
      type: 'string',
      description: 'Pack id, skill id, tool name, or config file id. Optional for summary; required for detail views.',
    },
    includeInstruction: {
      type: 'boolean',
      description: 'When inspecting a skill, include the instructionTemplate body. Defaults to false.',
    },
    includeSchema: {
      type: 'boolean',
      description: 'When inspecting a tool, include inputSchema/outputSchema. Defaults to false.',
    },
  },
  anyOf: [
    {
      properties: {
        view: { const: 'summary' },
      },
    },
    {
      properties: {
        view: { enum: ['pack', 'skill', 'tool', 'config'] },
        id: { type: 'string', minLength: 1 },
      },
      required: ['view', 'id'],
    },
  ],
} satisfies Record<string, unknown>

const UPDATE_ACTIVE_SKILLS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    load: {
      type: 'array',
      items: { type: 'string' },
      description: 'Skill ids to load into the current run context.',
    },
    unload: {
      type: 'array',
      items: { type: 'string' },
      description: 'Skill ids to unload or suppress for the current run context.',
    },
    reason: {
      type: 'string',
      description: 'Short reason for the skill state change.',
    },
    allowConflicts: {
      type: 'boolean',
      description: 'Advanced override. Defaults to false. Leave false for style skills; if the tool reports conflicts, ask the user which skill to use before loading.',
    },
  },
} satisfies Record<string, unknown>

const UPDATE_PLAN_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    planId: {
      type: 'string',
      description: 'Optional user-facing plan id. Use this when the user names the plan, e.g. "plan1".',
    },
    explanation: {
      type: 'string',
      description: 'Optional short reason for this plan update.',
    },
    tasks: {
      type: 'array',
      description: 'Complete current execution plan task list. Use this tool whenever the user asks to create, generate, or update a plan. Before calling, compare against Thread Runtime State.currentPlan; if every task step and status is identical, do not call this tool. After this tool returns updated or unchanged for a request, do not call it again for the same plan snapshot. Translate user status words into pending, in_progress, or completed; for example 未就绪, 未开始, 待办, not_ready, and not_started mean pending. At most one task may be in_progress.',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          step: { type: 'string', minLength: 1, maxLength: 300, description: 'Plan task title or step text.' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'pending means not ready/not started; in_progress means currently active; completed means done.' },
        },
        required: ['step', 'status'],
      },
    },
  },
  required: ['tasks'],
} satisfies Record<string, unknown>

const CREATE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'content'],
  properties: {
    kind: {
      type: 'string',
      enum: ['setting_proposal', 'project_standards_proposal', 'production_proposal', 'content_unit_proposal', 'asset_proposal'],
    },
    title: { type: 'string', description: 'Optional. Auto-generated from kind + project when omitted for proposal drafts.' },
    content: { type: 'string', description: 'Initial draft content. Structured proposal drafts must be valid JSON. For setting_proposal / asset_proposal, omitted or initially empty proposal snapshot arrays are prefilled from the hydrated current project data as a no-op baseline. After creation, edit agent://draft/{draftId}/content with standard file tools instead of replacing content through draft tools.' },
    projectId: { type: 'number' },
    productionId: { type: 'number', description: 'Optional hint for production_proposal drafts.' },
    source: { type: 'object', additionalProperties: true },
    target: { type: 'object', additionalProperties: true },
    seed: { type: 'object', additionalProperties: true, description: 'DraftDomainModel/MCP seed contract or hydrated seed summary to persist under metadata.seed.' },
    metadata: { type: 'object', additionalProperties: true },
    proposal: { type: 'boolean', description: 'When true, creates a reviewable proposal draft: adds schema validation, infers target/source, sets default title, and returns {proposalRef, draftId} plus validation/apply results when available.' },
  },
} satisfies Record<string, unknown>

const PREVIEW_DRAFT_APPLY_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftId'],
  properties: {
    draftId: { type: 'string' },
    target: { type: 'object', additionalProperties: true },
    targetEntityType: { type: 'string' },
    targetEntityId: { type: ['string', 'number'] },
    targetField: { type: 'string' },
    currentValue: {},
    proposedValue: {},
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

const PROJECT_STANDARDS_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: {
      type: 'number',
      description: 'Project id. Omit only when the current run context clearly has a selected project.',
    },
  },
} satisfies Record<string, unknown>

const VIDEO_FRAME_EXTRACT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resourceId: { type: 'number', minimum: 1, description: 'Video resource id from the user attachment.' },
    resource_id: { type: 'number', minimum: 1, description: 'Alias for resourceId.' },
    mode: { type: 'string', enum: ['overview', 'timestamps', 'range', 'burst'], description: 'Sampling mode: overview for representative full-video frames, timestamps for exact seconds, range for a time span, burst for a window around a second. Defaults from provided parameters.' },
    count: { type: 'number', minimum: 1, maximum: 8, description: 'Representative frame count for overview mode. Defaults to 4.' },
    maxFrames: { type: 'number', minimum: 1, maximum: 16, description: 'Maximum returned frame count for this extraction. Defaults to 8 and caps dense range/burst sampling.' },
    max_frames: { type: 'number', minimum: 1, maximum: 16, description: 'Alias for maxFrames.' },
    timestampsSec: { type: 'array', items: { type: 'number', minimum: 0 }, description: 'Specific timestamps in seconds.' },
    timestamps_sec: { type: 'array', items: { type: 'number', minimum: 0 }, description: 'Alias for timestampsSec.' },
    startSec: { type: 'number', minimum: 0, description: 'Range start time in seconds.' },
    start_sec: { type: 'number', minimum: 0, description: 'Alias for startSec.' },
    endSec: { type: 'number', minimum: 0, description: 'Range end time in seconds.' },
    end_sec: { type: 'number', minimum: 0, description: 'Alias for endSec.' },
    centerSec: { type: 'number', minimum: 0, description: 'Burst center time in seconds.' },
    center_sec: { type: 'number', minimum: 0, description: 'Alias for centerSec.' },
    windowSec: { type: 'number', minimum: 0, description: 'Burst window length in seconds. Defaults to 2.' },
    window_sec: { type: 'number', minimum: 0, description: 'Alias for windowSec.' },
    fps: { type: 'number', minimum: 0.1, maximum: 6, description: 'Sampling frequency for range/burst modes. Defaults to 2 and caps at 6.' },
    intervalSec: { type: 'number', minimum: 0.001, description: 'Sampling interval for range/burst modes. Takes precedence over fps.' },
    interval_sec: { type: 'number', minimum: 0.001, description: 'Alias for intervalSec.' },
    maxWidth: { type: 'number', minimum: 128, maximum: 1280, description: 'Maximum frame width. Defaults to 768.' },
    max_width: { type: 'number', minimum: 128, maximum: 1280, description: 'Alias for maxWidth.' },
    imageFormat: { type: 'string', enum: ['jpeg', 'png'], description: 'Frame image format. Defaults to jpeg.' },
    image_format: { type: 'string', enum: ['jpeg', 'png'], description: 'Alias for imageFormat.' },
  },
  anyOf: [
    { required: ['resourceId'] },
    { required: ['resource_id'] },
  ],
} satisfies Record<string, unknown>

const SEARCH_REFERENCE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', description: 'Search query, for example 雨夜街道参考, 分镜节奏, or slow push reveal.' },
    kind: { type: 'string', enum: ['image', 'video', 'text'], description: 'Optional result type.' },
    sources: { type: 'array', items: { type: 'string', enum: ['external_resource', 'shot_library', 'local_reference'] }, description: 'Optional source filters.' },
    source: { type: 'string', enum: ['external_resource', 'shot_library', 'local_reference'], description: 'Single source filter alias.' },
    method: { type: 'string', enum: ['keyword', 'semantic', 'native'], description: 'Preferred retrieval method.' },
    domain: { type: 'string', description: 'Optional local text reference domain, for example storyboard.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Optional local text tag filters.' },
    limit: { type: 'number', minimum: 1, maximum: 20 },
  },
} satisfies Record<string, unknown>

const GET_REFERENCE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string' },
    maxChars: { type: 'number', minimum: 1, maximum: 12000, description: 'Maximum body characters to return. Defaults to 4000.' },
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

void TASK_GRAPH_TASK_INPUT_SCHEMA
void TASK_GRAPH_TASK_UPDATE_SCHEMA
