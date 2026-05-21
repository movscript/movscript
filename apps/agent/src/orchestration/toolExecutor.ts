import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'
import type { AgentRun, ToolCall } from '../state/types.js'
import { buildApplyDraftPreview } from '../drafts/draftApply.js'
import { validateDraft, type AgentDraft, type AgentDraftKind, type AgentDraftSource, type AgentDraftStore, type AgentDraftTarget } from '../drafts/draftStore.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import { BackendApplyHTTPError, type BackendApplyClient } from '../drafts/backendApplyClient.js'
import { applyRuntimeDraftFromUI } from '../application/runtimeDraftOperations.js'
import type { ToolRegistry, ToolRiskLevel } from '../tools/toolRegistry.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemoryKind } from '../memory/types.js'
import { runtimeToolName } from '../tools/toolNames.js'
import { isJSONRecord, isJSONValue } from '../jsonValue.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import { buildRetrievedContextStore, countRetrievedContextChars, selectRetrievedContext, uniqueRetrievedContextRefs } from '../contextManager/retrievedContextStore.js'
import { isValidAgentEntityId, isValidAgentProjectId, isValidAgentReferenceId } from '../context/runtimeContext.js'
import { AgentFileSystem, type AgentFileEdit } from '../files/agentFileSystem.js'
import { DraftFileProvider, draftContentFileRef } from '../files/providers/draftFileProvider.js'

export type ToolSource = 'runtime' | 'mcp' | 'sandbox'

export interface ToolExecutionResult {
  call: ToolCall
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  sandboxed?: boolean
  source: ToolSource
}

export interface ToolExecutorOptions {
  run: AgentRun
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  fileSystem?: AgentFileSystem
  registry: ToolRegistry
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  sandboxMode: boolean
  signal?: AbortSignal
}

export interface AgentCatalogToolManager {
  inspectAgentCatalog(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  updateActiveSkills(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  createAgentPlan(run: AgentRun, input?: Record<string, JSONValue>): Promise<JSONValue> | JSONValue
  getAgentPlan(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  replanAgentPlan(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  spawnSubagent(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  listSubagents(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  waitSubagent(run: AgentRun, input?: Record<string, JSONValue>): Promise<JSONValue> | JSONValue
  startIO(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  getIO(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  listIO(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  waitIO(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  cancelIO(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  cancelSubagent(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const { run, mcpClient, draftStore, backendApplyClient, registry, memoryManager, knowledgeManager, catalogManager, sandboxMode } = options
  const fileSystem = options.fileSystem ?? new AgentFileSystem([new DraftFileProvider(draftStore)])
  throwIfAborted(options.signal)
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
  const runtimeResult = await callRuntimeTool(call.name, args, run, draftStore, backendApplyClient, fileSystem, memoryManager, knowledgeManager, catalogManager, sandboxMode, options.signal)
  throwIfAborted(options.signal)
  if (runtimeResult !== undefined) {
    return { call, result: runtimeResult, source: 'runtime' }
  }

  // MCP tools
  throwIfAborted(options.signal)
  await mcpClient.initialize({ signal: options.signal })
  throwIfAborted(options.signal)
  const runtimeName = runtimeToolName(call.name)
  const runtimeArgs = translateToolArgsForRuntime(call.name, args)
  const result = await mcpClient.callTool(runtimeName, runtimeArgs, { signal: options.signal })
  throwIfAborted(options.signal)
  return { call, result, source: 'mcp' }
}

async function callRuntimeTool(
  toolName: string,
  args: Record<string, JSONValue>,
  run: AgentRun,
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  fileSystem: AgentFileSystem,
  memoryManager: MemoryManager | undefined,
  knowledgeManager: KnowledgeManager | undefined,
  catalogManager: AgentCatalogToolManager | undefined,
  _sandboxMode: boolean,
  signal?: AbortSignal,
): Promise<JSONValue | undefined> {
  if (toolName === 'movscript_inspect_agent_catalog') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.inspectAgentCatalog(run, args)
  }

  if (toolName === 'movscript_update_active_skills') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.updateActiveSkills(run, args)
  }

  if (toolName === 'movscript_create_plan') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.createAgentPlan(run, args)
  }

  if (toolName === 'movscript_get_plan') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.getAgentPlan(run, args)
  }

  if (toolName === 'movscript_replan') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.replanAgentPlan(run, args)
  }

  if (toolName === 'movscript_spawn_subagent') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.spawnSubagent(run, args)
  }

  if (toolName === 'movscript_list_subagents') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.listSubagents(run, args)
  }

  if (toolName === 'movscript_wait_subagent') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.waitSubagent(run, args)
  }

  if (toolName === 'agent_io_start') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.startIO(run, args, { signal })
  }

  if (toolName === 'agent_io_get') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.getIO(run, args)
  }

  if (toolName === 'agent_io_list') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.listIO(run, args)
  }

  if (toolName === 'agent_io_wait') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.waitIO(run, args, { signal })
  }

  if (toolName === 'agent_io_cancel') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.cancelIO(run, args, { signal })
  }

  if (toolName === 'movscript_cancel_subagent') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.cancelSubagent(run, args)
  }

  if (toolName === 'movscript_get_project_standards') {
    const projectId = projectIdField(args.projectId)
      ?? projectIdField(args.project_id)
      ?? projectIdFromRunContext(run)
    if (projectId === undefined) throw new Error('get_project_standards requires projectId')
    const contextProject = projectFromRunContext(run, projectId)
    const user = userFromRunContext(run)
    const auth = {
      ...(isValidAgentReferenceId(user?.id) ? { userId: user.id } : {}),
      ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
      ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
    }
    const backendRead = await backendApplyClient.getProject(projectId, auth)
    const backendProject = isJSONRecord(backendRead.response) ? backendRead.response : undefined
    return buildProjectStandardsToolResult(projectId, backendProject ?? contextProject, {
      source: backendProject ? 'backend' : contextProject ? 'run_context' : 'unavailable',
      backendRead,
    }) as unknown as JSONValue
  }

  if (toolName === 'movscript_create_draft') {
    if (args.proposal === true || args.proposalKind !== undefined) {
      return createProposalDraft(draftStore, run, args) as unknown as JSONValue
    }
    return draftStore.createDraft({
      projectId: isValidAgentProjectId(args.projectId) ? args.projectId : undefined,
      kind: args.kind,
      title: args.title,
      content: args.content,
      source: {
        ...(isJSONRecord(args.source) ? args.source : {}),
        runId: run.id,
        threadId: run.threadId,
        ...extractPageContext(run),
      },
      target: args.target,
      seed: args.seed,
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: isJSONRecord(args.metadata) ? args.metadata : undefined,
    }) as unknown as JSONValue
  }

  if (toolName === 'movscript_get_draft') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('get_draft requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) {
      const scriptHint = /^\d+$/.test(draftId)
        ? ' movscript_get_draft only reads Agent local review draft artifacts, not backend project script IDs. To read 总剧本、第一集、分集剧本, or script body content, call movscript_read_project_scripts with projectId, scriptId or scriptTitle, and includeContent: true.'
        : ''
      throw new Error(`draft not found: ${draftId}.${scriptHint}`)
    }
    return {
      draft,
      file: {
        provider: 'draft',
        ref: draftContentFileRef(draft.id),
        id: draft.id,
        kind: draft.kind,
        title: draft.title,
        updatedAt: draft.updatedAt,
      },
      validation: validateDraft(draft),
    } as unknown as JSONValue
  }

  if (toolName === 'agent_file_read') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('agent_file_read requires ref')
    const read = fileSystem.read({ ref })
    const jsonPointer = stringField(args.jsonPointer ?? args.json_pointer)
    const contentLimit = Math.max(1, Math.min(Math.floor(numberField(args.contentLimit ?? args.content_limit) ?? 20000), 100000))
    const base = {
      status: 'read',
      file: read.file as unknown as JSONValue,
      ref: read.file.ref,
      revision: read.revision,
      contentLength: read.contentLength,
      ...(read.validation !== undefined ? { validation: read.validation } : {}),
    }
    if (jsonPointer) {
      return {
        ...base,
        jsonPointer,
        value: selectJSONPointerValue(read.content, jsonPointer) as JSONValue,
      } as unknown as JSONValue
    }
    return {
      ...base,
      content: read.content.length > contentLimit ? read.content.slice(0, contentLimit) : read.content,
      truncated: read.content.length > contentLimit,
    } as unknown as JSONValue
  }

  if (toolName === 'agent_file_search') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('agent_file_search requires ref')
    const query = stringField(args.query)
    const limit = Math.max(1, Math.min(Math.floor(numberField(args.limit) ?? 20), 100))
    if (!query) throw new Error('agent_file_search requires query')
    const result = fileSystem.search({ ref, query, limit })
    return {
      status: 'searched',
      file: result.file as unknown as JSONValue,
      ref: result.file.ref,
      revision: result.revision,
      query,
      matches: result.matches as unknown as JSONValue,
      matchCount: result.matchCount,
    } as unknown as JSONValue
  }

  if (toolName === 'agent_file_edit') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('agent_file_edit requires ref')
    const edits = normalizeAgentFileEdits(args.edits)
    const baseRevision = stringField(args.baseRevision ?? args.base_revision)
    const result = fileSystem.edit({
      ref,
      edits,
      precondition: baseRevision ? { baseRevision } : undefined,
      createdByRunId: run.id,
    })
    return {
      status: 'edited',
      file: result.file as unknown as JSONValue,
      ref: result.file.ref,
      changeSet: result.changeSet as unknown as JSONValue,
      replacementCount: result.changeSet.replacementCount,
      ...(result.validation !== undefined ? { validation: result.validation } : {}),
    } as unknown as JSONValue
  }

  if (toolName === 'agent_file_validate') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('agent_file_validate requires ref')
    return {
      status: 'validated',
      ref,
      validation: fileSystem.validate({ ref }),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_validate_draft') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('validate_draft requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    return {
      status: 'validated',
      draft,
      validation: validateDraft(draft),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_preview_draft_apply') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('preview_draft_apply requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    return previewDraftApply(draftStore, backendApplyClient, draft, args) as unknown as JSONValue
  }

  if (toolName === 'movscript_apply_draft') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('apply_draft requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    const validation = validateDraft(draft)
    if (!validation.ok) {
      return {
        ok: false,
        stage: 'local_validation',
        draftId,
        validation,
        message: 'Draft failed local validation. Patch the draft and validate again before applying.',
      } as unknown as JSONValue
    }
    const user = userFromRunContext(run)
    const result = await applyRuntimeDraftFromUI({
      draftStore,
      backendApplyClient,
      applyInput: {
        draftId,
        target: isJSONRecord(args.target) ? args.target : draft.target,
        targetEntityType: args.targetEntityType ?? args.target_entity_type,
        targetEntityId: args.targetEntityId ?? args.target_entity_id,
        targetField: args.targetField ?? args.target_field,
        currentValue: args.currentValue ?? args.current_value,
        proposedValue: args.proposedValue ?? args.proposed_value,
        appliedByUserId: args.appliedByUserId ?? args.applied_by_user_id ?? user?.id,
        ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
        ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
      },
      now: () => new Date().toISOString(),
      appliedBy: 'movscript-agent',
    })
    return {
      ok: true,
      stage: 'apply',
      validation,
      ...(isJSONRecord(result) ? result : { result }),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_search_memories') {
    if (!memoryManager) return { memories: [], count: 0 } as unknown as JSONValue
    const projectId = projectIdField(args.projectId)
    if (projectId === undefined) throw new Error('search_memories requires projectId')
    const memories = memoryManager.searchMemories({
      projectId,
      kind: normalizeMemoryKind(args.kind),
      query: typeof args.query === 'string' ? args.query : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })
    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        projectId: memory.projectId,
        title: memory.title,
        kind: memory.kind,
        excerpt: truncate(memory.content, 180),
        updatedAt: memory.updatedAt,
      })),
      count: memories.length,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_search_knowledge') {
    if (!knowledgeManager) return { results: [] } as unknown as JSONValue
    return knowledgeManager.search(args) as unknown as JSONValue
  }

  if (toolName === 'movscript_get_knowledge') {
    if (!knowledgeManager) throw new Error('knowledge manager unavailable')
    const budget = remainingKnowledgeBudget(run, stringField(args.id))
    if (budget.remainingChunks <= 0) {
      throw new Error(`knowledge chunk budget exceeded for this run (maxKnowledgeChunksPerRun=${budget.maxChunks})`)
    }
    if (budget.remainingChars <= 0) {
      throw new Error(`knowledge character budget exceeded for this run (maxKnowledgeCharsPerRun=${budget.maxChars})`)
    }
    return knowledgeManager.get(args, { maxChars: budget.remainingChars })
  }

  if (toolName === 'movscript_get_memory') {
    if (!memoryManager) return null as unknown as JSONValue
    const projectId = projectIdField(args.projectId)
    const id = stringField(args.id) ?? stringField(args.memoryId)
    if (projectId === undefined) throw new Error('get_memory requires projectId')
    if (!id) throw new Error('get_memory requires id')
    const memory = memoryManager.getMemory({ projectId, id })
    return (memory ?? null) as unknown as JSONValue
  }

  if (toolName === 'movscript_create_memory') {
    if (!memoryManager) throw new Error('memory manager unavailable')
    const projectId = projectIdField(args.projectId)
    const title = stringField(args.title)
    const content = stringField(args.content)
    const kind = normalizeMemoryKind(args.kind)
    if (projectId === undefined) throw new Error('create_memory requires projectId')
    if (!title) throw new Error('create_memory requires title')
    if (!kind) throw new Error('create_memory requires kind')
    if (!content) throw new Error('create_memory requires content')
    const memory = memoryManager.createMemory({
      projectId,
      title,
      kind,
      content,
      ...(typeof args.sourceThreadId === 'string' ? { sourceThreadId: args.sourceThreadId } : {}),
      ...(typeof args.sourceRunId === 'string' ? { sourceRunId: args.sourceRunId } : {}),
      ...(typeof args.sourceMessageId === 'string' ? { sourceMessageId: args.sourceMessageId } : {}),
    })
    return memory as unknown as JSONValue
  }

  if (toolName === 'movscript_delete_memory') {
    if (!memoryManager) throw new Error('memory manager unavailable')
    const projectId = projectIdField(args.projectId)
    const id = stringField(args.id) ?? stringField(args.memoryId)
    if (projectId === undefined) throw new Error('delete_memory requires projectId')
    if (!id) throw new Error('delete_memory requires id')
    return {
      deleted: memoryManager.deleteMemory({ projectId, id }),
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

function translateToolArgsForRuntime(toolName: string, args: Record<string, JSONValue>): Record<string, JSONValue> {
  return args
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function projectIdFromRunContext(run: AgentRun): number | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const project = isJSONRecord(context?.project) ? context.project : undefined
  const pageContext = isJSONRecord(context?.pageContext) ? context.pageContext : undefined
  return projectIdField(project?.id)
    ?? projectIdField(project?.ID)
    ?? projectIdField(pageContext?.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
}

function projectFromRunContext(run: AgentRun, projectId: number): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const project = isJSONRecord(context?.project) ? context.project : undefined
  const candidateId = projectIdField(project?.id) ?? projectIdField(project?.ID)
  return candidateId === projectId ? project : undefined
}

function userFromRunContext(run: AgentRun): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  return isJSONRecord(context?.user) ? context.user : undefined
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}

function remainingKnowledgeBudget(run: AgentRun, requestedId?: string): {
  maxChars: number
  maxChunks: number
  remainingChars: number
  remainingChunks: number
} {
  const metadata = isJSONRecord(run.metadata) ? run.metadata : undefined
  const limits = isJSONRecord(metadata?.limits) ? metadata.limits : {}
  const maxChars = positiveInteger(limits.maxKnowledgeCharsPerRun) ?? 8000
  const maxChunks = positiveInteger(limits.maxKnowledgeChunksPerRun) ?? 3
  const loadedKnowledge = selectRetrievedContext({
    store: buildRetrievedContextStore(metadata?.contextLedger),
    source: 'knowledge',
    refType: 'knowledge',
    summaryPrefix: 'movscript_get_knowledge ',
  })
  const uniqueLoadedChunks = new Set(uniqueRetrievedContextRefs(loadedKnowledge).map((ref) => ref.id))
  const usedChars = countRetrievedContextChars(loadedKnowledge)
  const requestedChunkAlreadyLoaded = requestedId ? uniqueLoadedChunks.has(requestedId) : false
  return {
    maxChars,
    maxChunks,
    remainingChars: Math.max(0, maxChars - usedChars),
    remainingChunks: requestedChunkAlreadyLoaded ? 1 : Math.max(0, maxChunks - uniqueLoadedChunks.size),
  }
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

function normalizeProposalDraftKind(value: JSONValue | undefined): AgentDraftKind | undefined {
  return value === 'script_split_proposal'
    || value === 'setting_proposal'
    || value === 'script'
    || value === 'asset_slot'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    || value === 'segment'
    || value === 'scene_moment'
    || value === 'asset_proposal'
    || value === 'project_standards_proposal'
    || value === 'production_proposal'
    || value === 'content_unit_proposal'
    ? value
    : undefined
}

function normalizeProposalDraftContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isJSONRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
}

function validateStructuredProposalDraftContent(kind: AgentDraftKind, content: string): void {
  const requiredSchema = kind === 'script_split_proposal'
    ? DRAFT_CONTENT_SCHEMA_IDS.scriptSplit
    : kind === 'setting_proposal'
      ? DRAFT_CONTENT_SCHEMA_IDS.settingProposal
    : kind === 'project_standards_proposal'
      ? DRAFT_CONTENT_SCHEMA_IDS.projectStandardsProposal
      : kind === 'production_proposal'
        ? DRAFT_CONTENT_SCHEMA_IDS.productionProposal
        : kind === 'asset_proposal'
          ? DRAFT_CONTENT_SCHEMA_IDS.assetProposal
          : kind === 'content_unit_proposal'
            ? DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal
          : undefined
  if (!requiredSchema) return
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON with schema ${requiredSchema}`)
  }
  if (!isJSONRecord(parsed) || parsed.schema !== requiredSchema) {
    throw new Error(`create_proposal ${kind} content must include schema ${requiredSchema}`)
  }
}

function normalizeProposalDraftTarget(value: unknown): AgentDraftTarget | undefined {
  if (!isJSONRecord(value)) return undefined
  const target: AgentDraftTarget = {
    ...(typeof value.entityType === 'string' && value.entityType.trim() ? { entityType: value.entityType.trim() } : {}),
    ...(isValidAgentReferenceId(value.entityId) ? { entityId: value.entityId } : {}),
    ...(isValidAgentProjectId(value.projectId) ? { projectId: value.projectId } : {}),
    ...(typeof value.field === 'string' && value.field.trim() ? { field: value.field.trim() } : {}),
  }
  return Object.keys(target).length > 0 ? target : undefined
}

function inferProposalDraftTarget(
  kind: AgentDraftKind,
  projectId: number | undefined,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
  args: Record<string, JSONValue>,
): AgentDraftTarget | undefined {
  const productionId = entityIdField(args.productionId)
    ?? entityIdField(args.production_id)
    ?? entityIdField(context?.productionId)
    ?? entityIdField(pageContext.pageEntityType === 'production' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'project',
      ...(projectId !== undefined ? { entityId: projectId } : {}),
      field: 'proposal',
    }
  }
  if (kind === 'production_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'production',
      ...(productionId !== undefined ? { entityId: productionId } : {}),
      field: 'proposal',
    }
  }
  if (kind === 'content_unit_proposal') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      ...(productionId !== undefined ? { entityType: 'production', entityId: productionId } : {}),
      field: 'proposal',
    }
  }
  return projectId !== undefined ? { projectId } : undefined
}

function normalizeProposalDraftSource(
  value: unknown,
  run: AgentRun,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
): AgentDraftSource {
  const source = isJSONRecord(value) ? { ...value } : {}
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  return {
    ...source,
    runId: run.id,
    threadId: run.threadId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...extractPageContext(run),
    producer: 'conversation',
  }
}

function defaultProposalDraftTitle(
  kind: AgentDraftKind,
  projectId: number | undefined,
  target: AgentDraftTarget | undefined,
): string {
  const projectLabel = projectId !== undefined ? `#${projectId}` : 'conversation'
  if (kind === 'project_standards_proposal') return `项目规范提案 - ${projectLabel}`
  if (kind === 'production_proposal') {
    const targetLabel = target?.entityId !== undefined ? `#${String(target.entityId)}` : projectLabel
    return `制作提案 - ${targetLabel}`
  }
  if (kind === 'content_unit_proposal') return `内容单元提案 - ${projectLabel}`
  return `提案草稿 - ${kind}`
}

function buildProjectStandardsToolResult(
  projectId: number,
  project: Record<string, JSONValue> | undefined,
  meta: {
    source: 'backend' | 'run_context' | 'unavailable'
    backendRead?: { performed: boolean; skippedReason?: string; response?: JSONValue }
  },
): Record<string, JSONValue> {
  const warnings: string[] = []
  if (!project) {
    if (meta.backendRead?.skippedReason) warnings.push(meta.backendRead.skippedReason)
    return {
      loaded: false,
      projectId,
      source: meta.source,
      standards: null,
      warnings,
      message: 'Project standards are unavailable because no backend project record or run context project snapshot was available.',
    }
  }

  const projectStyleRaw = project.project_style ?? project.projectStyle
  const parsedStyle = parseProjectStyle(projectStyleRaw)
  if (parsedStyle.warning) warnings.push(parsedStyle.warning)
  if (meta.backendRead?.skippedReason && meta.source !== 'backend') warnings.push(meta.backendRead.skippedReason)

  const aspectRatio = stringField(project.aspect_ratio) ?? stringField(project.aspectRatio) ?? stringField(parsedStyle.style.aspect_ratio)
  const visualStyle = stringField(project.visual_style) ?? stringField(project.visualStyle) ?? stringField(parsedStyle.style.visual_style)
  const core = compactJSONRecord({
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(visualStyle ? { visual_style: visualStyle } : {}),
    ...pickProjectStyleCore(parsedStyle.style),
  })
  const customRules = normalizeProjectStandardsRules(parsedStyle.style.custom_rules)
  const enabledCustomRules = customRules.filter((rule) => rule.enabled !== false)
  const promptSections = groupProjectStandardsRules(enabledCustomRules)
  const styleReferenceResourceIds = collectStyleReferenceResourceIds(enabledCustomRules)

  return {
    loaded: true,
    projectId,
    projectName: stringField(project.name) ?? stringField(project.title) ?? '',
    source: meta.source,
    standards: compactJSONRecord({
      core,
      custom_rules: customRules,
      enabled_custom_rules: enabledCustomRules,
      prompt_sections: promptSections,
      style_reference_resource_ids: styleReferenceResourceIds,
      project_style: parsedStyle.style,
      ...(typeof projectStyleRaw === 'string' ? { project_style_raw: projectStyleRaw } : {}),
      ...(stringField(project.UpdatedAt) ? { updated_at: stringField(project.UpdatedAt) } : {}),
      ...(stringField(project.updated_at) ? { updated_at: stringField(project.updated_at) } : {}),
    }),
    warnings,
    message: 'Project standards loaded. Use these standards for project-scoped creative planning, writing, prompt, asset, production, and generation work. If standards.style_reference_resource_ids is non-empty and an image/video generation tool supports reference_resource_ids, pass those ids as visual style references.',
  }
}

function parseProjectStyle(value: JSONValue | undefined): { style: Record<string, JSONValue>; warning?: string } {
  if (isJSONRecord(value)) return { style: value }
  if (typeof value !== 'string' || !value.trim()) return { style: {} }
  try {
    const parsed = JSON.parse(value) as JSONValue
    if (isJSONRecord(parsed)) return { style: parsed }
    return { style: {}, warning: 'project_style was present but was not a JSON object.' }
  } catch (error) {
    return {
      style: {},
      warning: `project_style could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function pickProjectStyleCore(style: Record<string, JSONValue>): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const key of [
    'shot_size_system',
    'camera_language',
    'lighting_style',
    'color_palette',
    'pacing_rules',
    'negative_rules',
  ]) {
    const value = style[key]
    if (projectStandardValueText(value)) out[key] = value
  }
  return out
}

function normalizeProjectStandardsRules(value: JSONValue | undefined): Array<Record<string, JSONValue>> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isJSONRecord(item)) return []
    const label = stringField(item.label) ?? stringField(item.name) ?? stringField(item.key) ?? `custom_rule_${index + 1}`
    const key = stringField(item.key) ?? label.toLowerCase().replace(/\s+/g, '_')
    const ruleValue = projectStandardValueText(item.value ?? item.content ?? item.description)
    if (!ruleValue) return []
    const role = normalizeProjectStandardsPromptRole(item.prompt_role ?? item.promptRole ?? item.role)
    return [compactJSONRecord({
      id: stringField(item.id) ?? `rule_${key}_${index + 1}`,
      key,
      label,
      category: stringField(item.category) ?? '',
      value: ruleValue,
      prompt_role: role,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      required: typeof item.required === 'boolean' ? item.required : false,
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : (index + 1) * 10,
    })]
  })
    .sort((a, b) => (numberField(a.order) ?? 0) - (numberField(b.order) ?? 0) || String(a.label ?? '').localeCompare(String(b.label ?? '')))
}

function groupProjectStandardsRules(rules: Array<Record<string, JSONValue>>): Record<string, JSONValue> {
  const sections: Record<string, JSONValue[]> = {
    context: [],
    style: [],
    constraint: [],
    negative: [],
    quality_gate: [],
  }
  for (const rule of rules) {
    const role = normalizeProjectStandardsPromptRole(rule.prompt_role)
    sections[role]!.push(rule)
  }
  return compactJSONRecord(sections)
}

function collectStyleReferenceResourceIds(rules: Array<Record<string, JSONValue>>): string[] {
  const ids = new Set<string>()
  for (const rule of rules) {
    const role = normalizeProjectStandardsPromptRole(rule.prompt_role)
    const text = [
      stringField(rule.key),
      stringField(rule.label),
      stringField(rule.category),
      projectStandardValueText(rule.value),
    ].filter(Boolean).join('\n')
    if (role !== 'style' && !/(style|visual|reference|参考|画风|风格)/i.test(text)) continue
    for (const id of extractReferenceResourceIds(text)) ids.add(id)
  }
  return Array.from(ids)
}

function extractReferenceResourceIds(value: string): string[] {
  const ids = new Set<string>()
  const text = value.trim()
  const resourcePattern = /(?:resource|resource_id|resourceId|资源)\s*#?\s*(\d+)/gi
  for (const match of text.matchAll(resourcePattern)) {
    if (match[1]) ids.add(match[1])
  }
  const listPattern = /(?:reference_resource_ids?|resource_ids?|resources?)\s*[:=]\s*([0-9,\s#]+)/gi
  for (const match of text.matchAll(listPattern)) {
    const list = match[1] ?? ''
    for (const id of list.match(/\d+/g) ?? []) ids.add(id)
  }
  return Array.from(ids)
}

function normalizeProjectStandardsPromptRole(value: JSONValue | undefined): 'context' | 'style' | 'constraint' | 'negative' | 'quality_gate' {
  return value === 'context' || value === 'style' || value === 'constraint' || value === 'negative' || value === 'quality_gate'
    ? value
    : 'constraint'
}

function projectStandardValueText(value: JSONValue | undefined): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => projectStandardValueText(item)).filter(Boolean).join('; ')
  return ''
}

function compactJSONRecord(value: Record<string, JSONValue>): Record<string, JSONValue> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null) return false
    if (typeof item === 'string') return item.trim().length > 0
    if (Array.isArray(item)) return item.length > 0
    if (isJSONRecord(item)) return Object.keys(item).length > 0
    return true
  })) as Record<string, JSONValue>
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}


function extractPageContext(run: AgentRun): Record<string, JSONValue> {
  const clientInput = isJSONRecord(run.metadata?.clientInput) ? run.metadata.clientInput : undefined
  const uiSnapshot = isJSONRecord(clientInput?.uiSnapshot) ? clientInput.uiSnapshot : undefined
  const pageContext = isJSONRecord(uiSnapshot?.pageContext) ? uiSnapshot.pageContext : undefined
  const route = isJSONRecord(uiSnapshot?.route) ? uiSnapshot.route : undefined
  const selection = isJSONRecord(uiSnapshot?.selection) ? uiSnapshot.selection : undefined
  return {
    ...(typeof pageContext?.pageKey === 'string' ? { pageKey: pageContext.pageKey } : {}),
    ...(typeof pageContext?.pageType === 'string' ? { pageType: pageContext.pageType } : {}),
    ...(typeof pageContext?.pageRoute === 'string' ? { pageRoute: pageContext.pageRoute } : typeof route?.pathname === 'string' ? { pageRoute: route.pathname } : {}),
    ...(typeof pageContext?.pageEntityType === 'string' ? { pageEntityType: pageContext.pageEntityType } : typeof selection?.entityType === 'string' ? { pageEntityType: selection.entityType } : {}),
    ...(isValidAgentReferenceId(pageContext?.pageEntityId)
      ? { pageEntityId: pageContext.pageEntityId }
      : isValidAgentReferenceId(selection?.entityId)
        ? { pageEntityId: selection.entityId }
        : {}),
    ...(typeof pageContext?.draftId === 'string' ? { draftId: pageContext.draftId } : {}),
  }
}

function draftRefArg(args: Record<string, JSONValue>): unknown {
  return draftRefStringField(args.draftRef)
    ?? draftRefStringField(args.draft_ref)
    ?? draftRefStringField(args.draftId)
    ?? draftRefStringField(args.draft_id)
    ?? draftRefStringField(args.id)
}

function draftRefStringField(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringField(value)
}

function selectJSONPointerValue(content: string, path: string): JSONValue {
  let value: unknown
  try {
    value = JSON.parse(content) as unknown
  } catch (error) {
    throw new Error(`read_draft_file jsonPointer requires JSON draft content: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isJSONValue(value)) throw new Error('read_draft_file jsonPointer resolved non-JSON draft content')
  if (path === '') return value
  if (!path.startsWith('/')) throw new Error('read_draft_file jsonPointer must be a JSON pointer')
  let current: unknown = value
  for (const segment of decodeToolJSONPointer(path)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`jsonPointer array path does not exist: ${path}`)
      current = current[index]
      continue
    }
    if (!isJSONRecord(current) || !(segment in current)) throw new Error(`jsonPointer object path does not exist: ${path}`)
    current = current[segment]
  }
  if (!isJSONValue(current)) throw new Error(`jsonPointer resolved non-JSON value: ${path}`)
  return current
}

function decodeToolJSONPointer(path: string): string[] {
  if (path === '/') return ['']
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function normalizeAgentFileEdits(value: JSONValue | undefined): AgentFileEdit[] {
  if (!Array.isArray(value)) throw new Error('agent_file_edit requires edits')
  return value.map((edit) => {
    if (!isJSONRecord(edit)) throw new Error('agent_file_edit edit must be an object')
    if (edit.type === 'set_content') {
      if (typeof edit.content !== 'string') throw new Error('set_content edit requires content')
      return { type: 'set_content', content: edit.content }
    }
    if (edit.type === 'replace_text') {
      if (typeof edit.oldText !== 'string') throw new Error('replace_text edit requires oldText')
      if (typeof edit.newText !== 'string') throw new Error('replace_text edit requires newText')
      return {
        type: 'replace_text',
        oldText: edit.oldText,
        newText: edit.newText,
        ...(edit.replaceAll === true ? { replaceAll: true } : {}),
      }
    }
    throw new Error(`unsupported agent file edit type: ${String(edit.type)}`)
  })
}

function createProposalDraft(
  draftStore: AgentDraftStore,
  run: AgentRun,
  args: Record<string, JSONValue>,
): JSONValue {
  const kind = normalizeProposalDraftKind(args.kind)
  if (!kind) throw new Error('create_proposal requires kind')
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const pageContext = extractPageContext(run)
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(args.projectId)
    ?? projectIdField(args.project_id)
    ?? projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_proposal' && projectId === undefined) {
    throw new Error('create_proposal requires projectId for project_standards_proposal')
  }
  const target = normalizeProposalDraftTarget(args.target)
    ?? inferProposalDraftTarget(kind, projectId, context, pageContext, args)
  const title = stringField(args.title) ?? defaultProposalDraftTitle(kind, projectId, target)
  const content = normalizeProposalDraftContent(args.content)
  if (content === undefined) throw new Error('create_proposal requires content')
  validateStructuredProposalDraftContent(kind, content)
  const source = normalizeProposalDraftSource(args.source, run, context, pageContext)
  const draft = draftStore.createDraft({
    projectId,
    kind,
    title,
    content,
    source,
    target,
    seed: args.seed,
    createdByRunId: run.id,
    createdByThreadId: run.threadId,
    metadata: {
      ...(isJSONRecord(args.metadata) ? args.metadata : {}),
      proposal: true,
      proposalKind: kind,
      producer: 'conversation',
      ...(projectId !== undefined ? { projectId } : {}),
      ...(isJSONRecord(target) ? { target } : {}),
      ...(typeof source.pageKey === 'string' ? { pageKey: source.pageKey } : {}),
    },
  })
  return {
    proposalRef: draft.id,
    draftRef: draft.id,
    draftId: draft.id,
    draft: draft as unknown as JSONValue,
    status: 'created',
    message: 'Created a local proposal review draft from the conversation.',
  } as unknown as JSONValue
}

async function previewDraftApply(
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  draft: NonNullable<ReturnType<AgentDraftStore['getDraft']>>,
  args: Record<string, JSONValue>,
): Promise<JSONValue> {
  const validation = validateDraft(draft)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      draftId: draft.id,
      validation,
      message: 'Draft failed local validation. Update the draft and preview again.',
    } as unknown as JSONValue
  }
  if (draft.kind === 'asset_proposal' || draft.kind === 'content_unit_proposal' || draft.kind === 'script_split_proposal') {
    return {
      ok: true,
      stage: 'local_validation',
      draftId: draft.id,
      validation,
      message: 'Draft is locally valid. Backend apply preview is intentionally not performed for this proposal kind yet.',
    } as unknown as JSONValue
  }
  try {
    const preview = buildApplyDraftPreview(draftStore, {
      draftId: draft.id,
      target: isJSONRecord(args.target) ? args.target : draft.target,
      targetEntityType: args.targetEntityType ?? args.target_entity_type,
      targetEntityId: args.targetEntityId ?? args.target_entity_id,
      targetField: args.targetField ?? args.target_field,
      currentValue: args.currentValue ?? args.current_value,
      proposedValue: args.proposedValue ?? args.proposed_value,
    })
    const backendApply = await backendApplyClient.previewApplyReview(preview.review)
    return {
      ok: true,
      stage: 'backend_apply_preview',
      draftId: draft.id,
      validation,
      review: preview.review,
      backendApply: backendApply as unknown as JSONValue,
    } as unknown as JSONValue
  } catch (error) {
    return {
      ok: false,
      stage: 'backend_apply_preview',
      draftId: draft.id,
      validation,
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
      message: 'Backend apply preview failed. Update the draft and preview again.',
    } as unknown as JSONValue
  }
}

function normalizeMemoryKind(value: JSONValue | undefined): AgentMemoryKind | undefined {
  return value === 'preference'
    || value === 'fact'
    || value === 'item_ref'
    || value === 'entity_ref'
    || value === 'draft'
    || value === 'decision'
    || value === 'warning'
    ? value
    : undefined
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}
