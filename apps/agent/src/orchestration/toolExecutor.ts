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
  updateProgressChecklist(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  startWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  getWork(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  listWork(run: AgentRun, input?: Record<string, JSONValue>): JSONValue
  waitWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
  cancelWork(run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue> | JSONValue
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
  const runtimeResult = await callRuntimeTool(call.name, args, run, mcpClient, draftStore, backendApplyClient, fileSystem, memoryManager, knowledgeManager, catalogManager, sandboxMode, options.signal)
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
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  fileSystem: AgentFileSystem,
  memoryManager: MemoryManager | undefined,
  knowledgeManager: KnowledgeManager | undefined,
  catalogManager: AgentCatalogToolManager | undefined,
  _sandboxMode: boolean,
  signal?: AbortSignal,
): Promise<JSONValue | undefined> {
  if (toolName === 'core_catalog_inspect') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.inspectAgentCatalog(run, args)
  }

  if (toolName === 'core_skill_update') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.updateActiveSkills(run, args)
  }

  if (toolName === 'core_progress_update') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.updateProgressChecklist(run, args)
  }

  if (toolName === 'core_work_start') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.startWork(run, args, { signal })
  }

  if (toolName === 'core_work_get') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.getWork(run, args)
  }

  if (toolName === 'core_work_list') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.listWork(run, args)
  }

  if (toolName === 'core_work_wait') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.waitWork(run, args, { signal })
  }

  if (toolName === 'core_work_cancel') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.cancelWork(run, args, { signal })
  }

  if (toolName === 'movscript_project_standards_get') {
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

  if (toolName === 'draft_create') {
    if (args.proposal === true || args.proposalKind !== undefined || isStructuredProposalDraftKind(args.kind)) {
      return await createProposalDraft(draftStore, run, mcpClient, args, signal) as unknown as JSONValue
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

  if (toolName === 'draft_get') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('get_draft requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) {
      const scriptHint = /^\d+$/.test(draftId)
        ? ' draft_get only reads Agent local review draft artifacts, not backend project script IDs. To read 总剧本、第一集、分集剧本, or script body content, call movscript_project_script_read with projectId, scriptId or scriptTitle, and includeContent: true.'
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

  if (toolName === 'draft_file_read') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('draft_file_read requires ref')
    const read = fileSystem.read({ ref })
    const jsonPointer = stringField(args.jsonPointer ?? args.json_pointer)
    const startLine = positiveIntegerField(args.startLine ?? args.start_line)
    const lineCount = positiveIntegerField(args.lineCount ?? args.line_count)
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
    if (startLine !== undefined || lineCount !== undefined) {
      const range = selectLineRange(read.content, {
        startLine: startLine ?? 1,
        lineCount: Math.min(lineCount ?? 120, 1000),
      })
      const limitedContent = range.content.length > contentLimit ? range.content.slice(0, contentLimit) : range.content
      return {
        ...base,
        startLine: range.startLine,
        endLine: range.endLine,
        totalLines: range.totalLines,
        content: limitedContent,
        truncated: range.truncated || range.content.length > contentLimit,
      } as unknown as JSONValue
    }
    return {
      ...base,
      content: read.content.length > contentLimit ? read.content.slice(0, contentLimit) : read.content,
      truncated: read.content.length > contentLimit,
    } as unknown as JSONValue
  }

  if (toolName === 'draft_file_search') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('draft_file_search requires ref')
    const query = stringField(args.query)
    const limit = Math.max(1, Math.min(Math.floor(numberField(args.limit) ?? 20), 100))
    if (!query) throw new Error('draft_file_search requires query')
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

  if (toolName === 'draft_file_edit') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('draft_file_edit requires ref')
    const edits = normalizeAgentFileEdits(args.edits, args.patch)
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

  if (toolName === 'draft_file_validate') {
    const ref = stringField(args.ref)
    if (!ref) throw new Error('draft_file_validate requires ref')
    return {
      status: 'validated',
      ref,
      validation: fileSystem.validate({ ref }),
    } as unknown as JSONValue
  }

  if (toolName === 'draft_validate') {
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

  if (toolName === 'draft_apply_preview') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('preview_draft_apply requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    return previewDraftApply(draftStore, backendApplyClient, draft, args) as unknown as JSONValue
  }

  if (toolName === 'draft_apply') {
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

  if (toolName === 'core_memory_search') {
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

  if (toolName === 'knowledge_search') {
    if (!knowledgeManager) return { results: [] } as unknown as JSONValue
    return knowledgeManager.search(args) as unknown as JSONValue
  }

  if (toolName === 'knowledge_get') {
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

  if (toolName === 'core_memory_get') {
    if (!memoryManager) return null as unknown as JSONValue
    const projectId = projectIdField(args.projectId)
    const id = stringField(args.id) ?? stringField(args.memoryId)
    if (projectId === undefined) throw new Error('get_memory requires projectId')
    if (!id) throw new Error('get_memory requires id')
    const memory = memoryManager.getMemory({ projectId, id })
    return (memory ?? null) as unknown as JSONValue
  }

  if (toolName === 'core_memory_create') {
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

  if (toolName === 'core_memory_delete') {
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

function positiveIntegerField(value: JSONValue | undefined): number | undefined {
  const number = numberField(value)
  if (number === undefined) return undefined
  const integer = Math.floor(number)
  return integer > 0 ? integer : undefined
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
    summaryPrefix: 'knowledge_get ',
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

function isStructuredProposalDraftKind(value: JSONValue | undefined): boolean {
  return value === 'script_split_proposal'
    || value === 'setting_proposal'
    || value === 'asset_proposal'
    || value === 'project_standards_proposal'
    || value === 'production_proposal'
    || value === 'content_unit_proposal'
}

function normalizeProposalDraftContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isJSONRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
}

function validateStructuredProposalDraftContent(kind: AgentDraftKind, content: string): Record<string, JSONValue> | undefined {
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
  if (!requiredSchema) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON with schema ${requiredSchema}`)
  }
  if (!isJSONRecord(parsed) || parsed.schema !== requiredSchema) {
    throw new Error(`create_proposal ${kind} content must include schema ${requiredSchema}`)
  }
  return parsed
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

function selectLineRange(content: string, input: { startLine: number; lineCount: number }): {
  content: string
  startLine: number
  endLine: number
  totalLines: number
  truncated: boolean
} {
  const lines = content.split(/\r?\n/)
  const totalLines = lines.length
  const startLine = Math.min(input.startLine, Math.max(totalLines, 1))
  const startIndex = startLine - 1
  const endIndexExclusive = Math.min(startIndex + input.lineCount, totalLines)
  const selected = lines.slice(startIndex, endIndexExclusive)
  return {
    content: selected.join('\n'),
    startLine,
    endLine: endIndexExclusive,
    totalLines,
    truncated: startLine > 1 || endIndexExclusive < totalLines,
  }
}

function normalizeAgentFileEdits(value: JSONValue | undefined, patch: JSONValue | undefined): AgentFileEdit[] {
  if (typeof patch === 'string' && patch.trim()) {
    if (value !== undefined) throw new Error('draft_file_edit accepts either edits or patch, not both')
    return [{ type: 'apply_patch', patch }]
  }
  if (!Array.isArray(value)) throw new Error('draft_file_edit requires edits or patch')
  return value.map((edit) => {
    if (!isJSONRecord(edit)) throw new Error('draft_file_edit edit must be an object')
    if (edit.type === 'apply_patch') {
      if (typeof edit.patch !== 'string') throw new Error('apply_patch edit requires patch')
      return { type: 'apply_patch', patch: edit.patch }
    }
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

interface PreparedProposalDraftContent {
  content: string
  seed?: JSONValue
  hydratedProposalBase?: boolean
  seededProposalSnapshot?: boolean
}

async function prepareProposalDraftContent(input: {
  kind: AgentDraftKind
  content: string
  target?: AgentDraftTarget
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  signal?: AbortSignal
}): Promise<PreparedProposalDraftContent> {
  const kind = input.kind
  if (kind !== 'setting_proposal' && kind !== 'asset_proposal') {
    return { content: input.content }
  }
  const originalParsed = parseProposalDraftContent(kind, input.content)
  const parsed = normalizeProjectLayerProposalSnapshotContent(kind, originalParsed)
  const normalizedSnapshotContent = JSON.stringify(parsed) !== JSON.stringify(originalParsed)
  if (!hasProjectLayerTarget(input.target)) {
    const contentWithoutBase = removeProjectLayerSnapshotBase(parsed)
    if (!normalizedSnapshotContent && JSON.stringify(contentWithoutBase) === JSON.stringify(originalParsed)) return { content: input.content }
    return { content: JSON.stringify(contentWithoutBase, null, 2) }
  }

  const hydrated = await hydrateProjectLayerSnapshotBase({ ...input, kind })
  const seeded = seedProjectLayerProposalSnapshot(kind, removeProjectLayerSnapshotBase(parsed), hydrated.snapshotBase)
  return {
    content: JSON.stringify(seeded.content, null, 2),
    seed: hydrated.seed,
    hydratedProposalBase: true,
    ...(seeded.changed ? { seededProposalSnapshot: true } : {}),
  }
}

function parseProposalDraftContent(kind: AgentDraftKind, content: string): Record<string, JSONValue> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON`)
  }
  if (!isJSONRecord(parsed)) throw new Error(`create_proposal ${kind} content must be a JSON object`)
  return parsed
}

function hasProjectLayerTarget(target: AgentDraftTarget | undefined): boolean {
  if (!isJSONRecord(target)) return false
  return projectIdField(target.projectId) !== undefined || projectIdField(target.entityId) !== undefined
}

function removeProjectLayerSnapshotBase(parsed: Record<string, JSONValue>): Record<string, JSONValue> {
  const rest = { ...parsed }
  delete rest.snapshot_base
  return rest
}

function mergeHydratedProjectLayerBaseIntoProposal(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
  hydratedSnapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  const field = kind === 'setting_proposal' ? 'creative_references' : 'asset_slots'
  const hydratedItems = Array.isArray(hydratedSnapshotBase[field]) ? hydratedSnapshotBase[field] : []
  const proposal = isJSONRecord(parsed.proposal) ? parsed.proposal : {}
  const proposedItems = Array.isArray(proposal[field]) ? proposal[field] : undefined
  const shouldSeedWithHydratedItems = proposedItems === undefined
    || proposedItems.length === 0
    || (hydratedItems.length > 0 && proposedItems.every(isNewSnapshotNode))
  if (!shouldSeedWithHydratedItems) return { content: parsed, changed: false }
  const nextItems = proposedItems !== undefined && proposedItems.length > 0
    ? [...cloneJSONValue(hydratedItems), ...proposedItems]
    : cloneJSONValue(hydratedItems)
  return {
    content: {
      ...parsed,
      proposal: {
        ...proposal,
        [field]: nextItems,
      },
    },
    changed: true,
  }
}

function isNewSnapshotNode(value: JSONValue): boolean {
  if (!isJSONRecord(value)) return true
  return normalizedNumber(value.id) === undefined && normalizedNumber(value.ID) === undefined
}

function normalizeProjectLayerProposalSnapshotContent(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
): Record<string, JSONValue> {
  if (kind !== 'asset_proposal') return parsed
  const proposal = isJSONRecord(parsed.proposal) ? parsed.proposal : undefined
  const nextProposal = proposal && Array.isArray(proposal.asset_slots)
    ? { ...proposal, asset_slots: normalizeAssetProposalSnapshotSlots(proposal.asset_slots) }
    : proposal
  return {
    ...parsed,
    ...(nextProposal ? { proposal: nextProposal } : {}),
  }
}

function normalizeAssetProposalSnapshotSlots(value: JSONValue[]): JSONValue[] {
  return value.map((item) => {
    if (!isJSONRecord(item)) return item
    const normalized: Record<string, JSONValue> = {}
    setNormalizedField(normalized, 'client_id', normalizedString(item.client_id))
    setNormalizedField(normalized, 'id', normalizedNumber(item.id) ?? normalizedNumber(item.ID))
    setNormalizedOwner(normalized, item.owner)
    setNormalizedField(normalized, 'production_id', normalizedNumber(item.production_id) ?? normalizedNumber(item.ProductionID))
    setNormalizedField(normalized, 'creative_reference_id', normalizedNumber(item.creative_reference_id) ?? normalizedNumber(item.CreativeReferenceID))
    setNormalizedField(normalized, 'creative_reference_state_id', normalizedNumber(item.creative_reference_state_id) ?? normalizedNumber(item.CreativeReferenceStateID))
    setNormalizedField(normalized, 'owner_type', normalizedString(item.owner_type) ?? normalizedString(item.OwnerType))
    setNormalizedField(normalized, 'owner_id', normalizedNumber(item.owner_id) ?? normalizedNumber(item.OwnerID))
    setNormalizedField(normalized, 'kind', normalizedString(item.kind) ?? normalizedString(item.Kind))
    setNormalizedField(normalized, 'name', normalizedString(item.name) ?? normalizedString(item.Name))
    setNormalizedField(normalized, 'description', normalizedString(item.description) ?? normalizedString(item.Description))
    setNormalizedField(normalized, 'slot_key', normalizedString(item.slot_key) ?? normalizedString(item.SlotKey))
    setNormalizedField(normalized, 'prompt_hint', normalizedString(item.prompt_hint) ?? normalizedString(item.PromptHint))
    setNormalizedField(normalized, 'priority', normalizedString(item.priority) ?? normalizedString(item.Priority))
    setNormalizedField(normalized, 'status', normalizedString(item.status) ?? normalizedString(item.Status))
    setNormalizedField(normalized, 'resource_id', normalizedNumber(item.resource_id) ?? normalizedNumber(item.ResourceID))
    setNormalizedField(normalized, 'locked_asset_slot_id', normalizedNumber(item.locked_asset_slot_id) ?? normalizedNumber(item.LockedAssetSlotID))
    setNormalizedField(normalized, 'metadata_json', normalizedString(item.metadata_json) ?? normalizedString(item.MetadataJSON))
    return normalized
  })
}

function setNormalizedOwner(out: Record<string, JSONValue>, value: JSONValue | undefined): void {
  if (!isJSONRecord(value)) return
  const owner: Record<string, JSONValue> = {}
  setNormalizedField(owner, 'type', normalizedString(value.type))
  setNormalizedField(owner, 'id', normalizedNumber(value.id))
  setNormalizedField(owner, 'client_id', normalizedString(value.client_id))
  if (owner.type !== undefined) out.owner = owner
}

function setNormalizedField(out: Record<string, JSONValue>, key: string, value: JSONValue | undefined): void {
  if (value !== undefined) out[key] = value
}

function normalizedString(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizedNumber(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function seedProjectLayerProposalSnapshot(
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>,
  parsed: Record<string, JSONValue>,
  snapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  return mergeHydratedProjectLayerBaseIntoProposal(kind, parsed, snapshotBase)
}

function cloneJSONValue<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function hydrateProjectLayerSnapshotBase(input: {
  kind: Extract<AgentDraftKind, 'setting_proposal' | 'asset_proposal'>
  target?: AgentDraftTarget
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  signal?: AbortSignal
}): Promise<{ snapshotBase: Record<string, JSONValue>; seed?: JSONValue }> {
  try {
    await input.mcpClient.initialize({ signal: input.signal })
    const contract = unwrapMCPToolData(await input.mcpClient.callTool('draft_model_get', {
      kind: input.kind,
      ...(input.target ? { target: input.target as unknown as JSONValue } : {}),
      seedMode: 'editable_snapshot',
      hydrate: true,
    }, { signal: input.signal }))
    const seed = isJSONRecord(contract) && isJSONRecord(contract.seed) ? contract.seed : undefined
    const data = isJSONRecord(seed?.data) ? seed.data : undefined
    if (input.kind === 'setting_proposal') {
      const fallback = Array.isArray(data?.creative_references)
        ? undefined
        : await hydrateProjectLayerSeedFallback(input.mcpClient, input.target, 'creative_references', input.signal)
      const creativeReferences = Array.isArray(data?.creative_references)
        ? data.creative_references
        : fallback?.value
      if (!Array.isArray(creativeReferences)) throw new Error(missingHydratedSeedMessage('creative_references', seed, fallback))
      return {
        snapshotBase: { creative_references: creativeReferences as JSONValue },
        ...(seed ? { seed } : {}),
      }
    }
    const fallback = Array.isArray(data?.asset_slots)
      ? undefined
      : await hydrateProjectLayerSeedFallback(input.mcpClient, input.target, 'asset_slots', input.signal)
    const assetSlots = Array.isArray(data?.asset_slots)
      ? data.asset_slots
      : fallback?.value
    if (!Array.isArray(assetSlots)) throw new Error(missingHydratedSeedMessage('asset_slots', seed, fallback))
    return {
      snapshotBase: { asset_slots: normalizeAssetProposalSnapshotSlots(assetSlots as JSONValue[]) as JSONValue },
      ...(seed ? { seed } : {}),
    }
  } catch (error) {
    const field = input.kind === 'setting_proposal' ? 'creative_references' : 'asset_slots'
    throw new Error(`create_proposal ${input.kind} could not hydrate proposal.${field} automatically: ${error instanceof Error ? error.message : String(error)}`)
  }
}

interface ProjectLayerSeedFallbackResult {
  value?: unknown
  diagnostic: string
}

async function hydrateProjectLayerSeedFallback(
  mcpClient: Pick<MCPClient, 'callTool'>,
  target: AgentDraftTarget | undefined,
  field: 'creative_references' | 'asset_slots',
  signal?: AbortSignal,
): Promise<ProjectLayerSeedFallbackResult> {
  const projectId = projectIdField(isJSONRecord(target) ? target.projectId : undefined)
    ?? projectIdField(isJSONRecord(target) ? target.entityId : undefined)
  if (projectId === undefined) return { diagnostic: 'fallback skipped: projectId unavailable from target' }
  try {
    if (field === 'creative_references') {
      const result = unwrapMCPToolData(await mcpClient.callTool('movscript_creative_reference_query', {
        project_id: projectId,
        limit: 500,
      }, { signal }))
      const value = isJSONRecord(result) && Array.isArray(result.creative_references)
        ? result.creative_references
        : undefined
      return {
        ...(value ? { value } : {}),
        diagnostic: value
          ? `fallback movscript_creative_reference_query returned ${value.length} item(s)`
          : `fallback movscript_creative_reference_query missing creative_references; result keys: ${jsonRecordKeys(result)}`,
      }
    }
    const result = unwrapMCPToolData(await mcpClient.callTool('movscript_asset_slot_query', {
      project_id: projectId,
      include_internal: true,
      limit: 500,
    }, { signal }))
    const value = isJSONRecord(result) && Array.isArray(result.asset_slots)
      ? result.asset_slots
      : undefined
    return {
      ...(value ? { value } : {}),
      diagnostic: value
        ? `fallback movscript_asset_slot_query returned ${value.length} item(s)`
        : `fallback movscript_asset_slot_query missing asset_slots; result keys: ${jsonRecordKeys(result)}`,
    }
  } catch (error) {
    return { diagnostic: `fallback query failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function missingHydratedSeedMessage(
  field: 'creative_references' | 'asset_slots',
  seed: Record<string, JSONValue> | undefined,
  fallback: ProjectLayerSeedFallbackResult | undefined,
): string {
  const warnings = Array.isArray(seed?.warnings)
    ? seed.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const data = isJSONRecord(seed?.data) ? seed.data : undefined
  const details = [
    `seed data keys: ${data ? Object.keys(data).join(', ') || '(none)' : '(missing)'}`,
    ...(warnings.length > 0 ? [`seed warnings: ${warnings.join('; ')}`] : []),
    ...(fallback ? [fallback.diagnostic] : []),
  ]
  return `hydrated seed did not include ${field}; ${details.join('; ')}`
}

function jsonRecordKeys(value: unknown): string {
  return isJSONRecord(value) ? Object.keys(value).join(', ') || '(none)' : '(non-object)'
}

function unwrapMCPToolData(value: JSONValue): JSONValue {
  if (isJSONRecord(value) && value.data !== undefined && isJSONValue(value.data)) return value.data
  return value
}

async function createProposalDraft(
  draftStore: AgentDraftStore,
  run: AgentRun,
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
  args: Record<string, JSONValue>,
  signal?: AbortSignal,
): Promise<JSONValue> {
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
  const rawContent = normalizeProposalDraftContent(args.content)
  if (rawContent === undefined) throw new Error('create_proposal requires content')
  const prepared = await prepareProposalDraftContent({
    kind,
    content: rawContent,
    target,
    mcpClient,
    signal,
  })
  const content = prepared.content
  validateStructuredProposalDraftContent(kind, content)
  const source = normalizeProposalDraftSource(args.source, run, context, pageContext)
  const seed = args.seed ?? prepared.seed
  const draft = draftStore.createDraft({
    projectId,
    kind,
    title,
    content,
    source,
    target,
    seed,
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
      ...(prepared.hydratedProposalBase ? { proposalBaseHydrated: true } : {}),
      ...(prepared.seededProposalSnapshot ? { proposalSnapshotSeeded: true } : {}),
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
