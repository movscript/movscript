import type { MCPClient } from '../../mcpClient.js'
import type { JSONValue } from '../types.js'
import type { AgentRun, ToolCall } from '../types.js'
import type { AgentDraftStore } from '../store/draftStore.js'
import type { BackendApplyClient, BackendApplyResult } from '../store/backendApplyClient.js'
import type { ToolRegistry, ToolRiskLevel } from '../tools/toolRegistry.js'
import { buildApplyDraftPreview, markDraftApplied } from '../store/draftApply.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemoryKind, AgentMemoryScope } from '../memory/types.js'

export type ToolSource = 'runtime' | 'mcp' | 'sandbox'

export interface ToolExecutionResult {
  call: ToolCall
  result?: JSONValue
  error?: string
  sandboxed?: boolean
  source: ToolSource
}

export interface ToolExecutorOptions {
  run: AgentRun
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  memoryManager?: MemoryManager
  sandboxMode: boolean
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const { run, mcpClient, draftStore, backendApplyClient, registry, memoryManager, sandboxMode } = options
  const args = call.args ?? {}

  // Sandbox intercept for write/generate/destructive tools
  if (sandboxMode) {
    const tool = registry.get(call.name)
    if (tool && isSandboxIntercepted(tool.risk)) {
      return {
        call,
        result: buildSandboxResult(call.name, args),
        sandboxed: true,
        source: 'sandbox',
      }
    }
  }

  // Runtime tools handled locally
  const runtimeResult = await callRuntimeTool(call.name, args, run, draftStore, backendApplyClient, memoryManager, sandboxMode)
  if (runtimeResult !== undefined) {
    return { call, result: runtimeResult, source: 'runtime' }
  }

  // MCP tools
  await mcpClient.initialize()
  const result = await mcpClient.callTool(call.name, args)
  return { call, result, source: 'mcp' }
}

async function callRuntimeTool(
  toolName: string,
  args: Record<string, JSONValue>,
  run: AgentRun,
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  memoryManager: MemoryManager | undefined,
  sandboxMode: boolean,
): Promise<JSONValue | undefined> {
  if (toolName === 'movscript_create_draft') {
    return draftStore.createDraft({
      projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
      kind: args.kind,
      title: args.title,
      content: args.content,
      source: {
        ...(isRecord(args.source) ? args.source : {}),
        runId: run.id,
        threadId: run.threadId,
      },
      target: args.target,
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: isRecord(args.metadata) ? args.metadata : undefined,
    }) as unknown as JSONValue
  }

  if (toolName === 'movscript_list_drafts') {
    return {
      drafts: draftStore.listDrafts(normalizeDraftQuery(args)),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_apply_draft') {
    if (sandboxMode) {
      return buildSandboxResult(toolName, args)
    }
    const preview = buildApplyDraftPreview(draftStore, args)
    const context = isRecord(run.metadata?.context) ? run.metadata.context as Record<string, unknown> : undefined
    const appliedByUserId = args.appliedByUserId ?? (context?.user as Record<string, unknown> | undefined)?.id
    let backendApply: BackendApplyResult
    try {
      backendApply = await backendApplyClient.applyReview(
        preview.review,
        {
          ...(typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string' ? { userId: appliedByUserId } : {}),
          ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
        },
      )
    } catch (error) {
      draftStore.updateDraft(preview.draft.id, {
        metadata: {
          ...(isRecord(preview.draft.metadata) ? preview.draft.metadata : {}),
          backendWritePerformed: false,
          backendWriteError: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
    const finalDraft = markDraftApplied(draftStore, preview.draft, preview.review, {
      ...args,
      ...(typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string' ? { appliedByUserId } : {}),
    }, {
      backendWritePerformed: backendApply.performed,
      backendApply: backendApply as unknown as JSONValue,
    })
    return {
      status: 'applied',
      review: preview.review,
      draft: finalDraft,
      message: backendApply.performed
        ? 'Draft applied and backend entity patch completed.'
        : 'Draft marked applied in the local agent lifecycle. Backend entity patch was skipped.',
      backendApply,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_create_script') {
    const projectId = typeof args.projectId === 'number' && Number.isFinite(args.projectId) ? args.projectId : undefined
    if (projectId === undefined) throw new Error('create_script requires projectId')
    const context = isRecord(run.metadata?.context) ? run.metadata.context as Record<string, unknown> : undefined
    const userId = args.createdByUserId ?? (context?.user as Record<string, unknown> | undefined)?.id
    const payload = normalizeCreateScriptPayload(args)
    const backendCreate = await backendApplyClient.createScript(projectId, payload, {
      ...(typeof userId === 'number' || typeof userId === 'string' ? { userId } : {}),
      ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
    })
    return {
      status: backendCreate.performed ? 'created' : 'skipped',
      projectId,
      script: backendCreate.response ?? null,
      message: backendCreate.performed
        ? 'Formal script created in the backend project.'
        : 'Formal script creation was skipped.',
      backendCreate,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_search_memories') {
    if (!memoryManager) return { memories: [], count: 0 } as unknown as JSONValue
    const context = isRecord(run.metadata?.context) ? run.metadata.context as Record<string, JSONValue> : undefined
    const contextProject = isRecord(context?.project) && typeof context.project.id === 'number' ? context.project.id : undefined
    const memories = memoryManager.searchMemories({
      projectId: typeof args.projectId === 'number' ? args.projectId : contextProject,
      threadId: typeof args.threadId === 'string' ? args.threadId : run.threadId,
      scope: normalizeMemoryScope(args.scope),
      kind: normalizeMemoryKind(args.kind),
      query: typeof args.query === 'string' ? args.query : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })
    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        scope: memory.scope,
        ...(typeof memory.projectId === 'number' ? { projectId: memory.projectId } : {}),
        ...(memory.threadId ? { threadId: memory.threadId } : {}),
        kind: memory.kind,
        content: memory.content,
        updatedAt: memory.updatedAt,
      })),
      count: memories.length,
    } as unknown as JSONValue
  }

  return undefined
}

function isSandboxIntercepted(risk: ToolRiskLevel): boolean {
  return risk === 'write' || risk === 'generate' || risk === 'destructive'
}

function buildSandboxResult(toolName: string, args: Record<string, JSONValue>): JSONValue {
  return {
    sandboxed: true,
    wouldHaveExecuted: { name: toolName, args },
    simulatedResult: `${toolName} intercepted by sandbox mode (not actually executed)`,
    interceptedAt: new Date().toISOString(),
  }
}

function normalizeCreateScriptPayload(args: Record<string, JSONValue>): Record<string, JSONValue> {
  const title = stringField(args.title)
  const content = stringField(args.content)
  if (!title) throw new Error('create_script requires title')
  if (!content) throw new Error('create_script requires content')

  const payload: Record<string, JSONValue> = {
    title,
    content,
    raw_source: stringField(args.raw_source) ?? content,
    script_type: stringField(args.script_type) ?? 'uncategorized',
    source_type: normalizeSourceType(args.source_type),
    version: numberField(args.version) ?? 1,
  }
  copyStringFields(args, payload, [
    'description',
    'summary',
    'characters',
    'core_settings',
    'hook',
    'plot_summary',
    'script_points',
    'time_text',
    'location_text',
    'structured_characters',
    'plot_beats',
    'atmosphere',
    'structure_json',
    'entity_candidates',
    'relationship_candidates',
  ])
  copyNumberFields(args, payload, [
    'planned_scene_count',
    'planned_character_count',
    'order',
  ])
  if (typeof args.parent_script_id === 'number') payload.parent_script_id = args.parent_script_id
  if (typeof args.assignee_id === 'number') payload.assignee_id = args.assignee_id
  return payload
}

function copyStringFields(source: Record<string, JSONValue>, target: Record<string, JSONValue>, fields: string[]): void {
  for (const field of fields) {
    const value = stringField(source[field])
    if (value !== undefined) target[field] = value
  }
}

function copyNumberFields(source: Record<string, JSONValue>, target: Record<string, JSONValue>, fields: string[]): void {
  for (const field of fields) {
    const value = numberField(source[field])
    if (value !== undefined) target[field] = value
  }
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeSourceType(value: JSONValue | undefined): string {
  return value === 'adapted' || value === 'revised' || value === 'raw' ? value : 'raw'
}

function normalizeDraftQuery(args: Record<string, JSONValue>): {
  projectId?: number
  limit?: number
} {
  return {
    ...(typeof args.projectId === 'number' && Number.isFinite(args.projectId) ? { projectId: args.projectId } : {}),
    ...(typeof args.limit === 'number' && Number.isFinite(args.limit) ? { limit: args.limit } : {}),
  }
}

function normalizeMemoryScope(value: JSONValue | undefined): AgentMemoryScope | undefined {
  return value === 'global' || value === 'project' || value === 'thread' ? value : undefined
}

function normalizeMemoryKind(value: JSONValue | undefined): AgentMemoryKind | undefined {
  return value === 'preference'
    || value === 'fact'
    || value === 'entity_ref'
    || value === 'draft'
    || value === 'decision'
    || value === 'warning'
    ? value
    : undefined
}

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
