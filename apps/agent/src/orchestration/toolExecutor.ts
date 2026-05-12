import { MCPError, type MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'
import type { AgentRun, ToolCall } from '../state/types.js'
import { buildApplyDraftPreview } from '../drafts/draftApply.js'
import { normalizeDraftStatus, validateDraft, type AgentDraftKind, type AgentDraftSource, type AgentDraftStatus, type AgentDraftStore, type AgentDraftTarget } from '../drafts/draftStore.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import { BackendApplyHTTPError, type BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { ToolRegistry, ToolRiskLevel } from '../tools/toolRegistry.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type { AgentMemoryKind } from '../memory/types.js'
import { runtimeToolName } from '../tools/toolNames.js'

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
  catalogManager?: AgentCatalogToolManager
  sandboxMode: boolean
  signal?: AbortSignal
}

export interface AgentCatalogToolManager {
  listAgentBundles(): JSONValue
  inspectAgentBundle(input?: Record<string, JSONValue>): JSONValue
  enableAgentBundle(input?: Record<string, JSONValue>): JSONValue
  reloadAgentCatalog(): JSONValue
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const { run, mcpClient, draftStore, backendApplyClient, registry, memoryManager, catalogManager, sandboxMode } = options
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
  const runtimeResult = await callRuntimeTool(call.name, args, run, draftStore, backendApplyClient, memoryManager, catalogManager, sandboxMode)
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
  const result = await callMCPToolWithGenerationRepair(mcpClient, runtimeName, runtimeArgs, { signal: options.signal })
  throwIfAborted(options.signal)
  return { call, result, source: 'mcp' }
}

async function callMCPToolWithGenerationRepair(
  mcpClient: Pick<MCPClient, 'callTool'>,
  toolName: string,
  args: Record<string, JSONValue>,
  options: { signal?: AbortSignal },
): Promise<JSONValue> {
  try {
    return await mcpClient.callTool(toolName, args, options)
  } catch (error) {
    const repairedArgs = generationRepairArgs(toolName, args, error)
    if (!repairedArgs) throw error
    return mcpClient.callTool(toolName, repairedArgs, options)
  }
}

function generationRepairArgs(toolName: string, args: Record<string, JSONValue>, error: unknown): Record<string, JSONValue> | undefined {
  if (toolName !== 'movscript_create_generation_job') return undefined
  if (!(error instanceof MCPError)) return undefined
  const data = isRecord(error.data) ? error.data : undefined
  if (!data || data.type !== 'backend_http_error' || data.status !== 400) return undefined
  const suggestedFix = isRecord(data.suggested_fix) ? data.suggested_fix : undefined
  if (!suggestedFix) return undefined
  const repaired = applyGenerationSuggestedFix(args, suggestedFix)
  if (!repaired) return undefined
  return {
    ...repaired,
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  }
}

function applyGenerationSuggestedFix(args: Record<string, JSONValue>, suggestedFix: Record<string, JSONValue>): Record<string, JSONValue> | undefined {
  let changed = false
  const next: Record<string, JSONValue> = { ...args }
  const extraParams = isRecord(args.extra_params) ? { ...args.extra_params } : {}

  for (const [key, value] of Object.entries(suggestedFix)) {
    if (!isGenerationRepairValue(value)) continue
    switch (key) {
      case 'aspect_ratio':
        if (next.aspect_ratio !== value) {
          next.aspect_ratio = value
          changed = true
        }
        break
      case 'duration':
        if (next.duration !== value) {
          next.duration = value
          changed = true
        }
        break
      default:
        if (extraParams[key] !== value) {
          extraParams[key] = value
          changed = true
        }
        break
    }
  }

  if (!changed) return undefined
  if (Object.keys(extraParams).length > 0) {
    next.extra_params = extraParams
  }
  return next
}

function isGenerationRepairValue(value: JSONValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

async function callRuntimeTool(
  toolName: string,
  args: Record<string, JSONValue>,
  run: AgentRun,
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  memoryManager: MemoryManager | undefined,
  catalogManager: AgentCatalogToolManager | undefined,
  _sandboxMode: boolean,
): Promise<JSONValue | undefined> {
  if (toolName === 'movscript_list_agent_bundles') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.listAgentBundles()
  }

  if (toolName === 'movscript_inspect_agent_bundle') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.inspectAgentBundle(args)
  }

  if (toolName === 'movscript_enable_agent_bundle') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.enableAgentBundle(args)
  }

  if (toolName === 'movscript_reload_agent_catalog') {
    if (!catalogManager) throw new Error('agent catalog manager is not configured')
    return catalogManager.reloadAgentCatalog()
  }

  if (toolName === 'movscript_create_draft') {
    if (args.proposal === true || args.proposalKind !== undefined) {
      return createProposalDraft(draftStore, run, args) as unknown as JSONValue
    }
    return draftStore.createDraft({
      projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
      kind: args.kind,
      title: args.title,
      content: args.content,
      source: {
        ...(isRecord(args.source) ? args.source : {}),
        runId: run.id,
        threadId: run.threadId,
        ...extractPageContext(run),
      },
      target: args.target,
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: isRecord(args.metadata) ? args.metadata : undefined,
    }) as unknown as JSONValue
  }

  if (toolName === 'movscript_get_draft') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('get_draft requires draftId')
    const draft = draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    return {
      draft,
      validation: validateDraft(draft),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_update_draft') {
    const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
    if (!draftId) throw new Error('update_draft requires draftId')
    return updateDraftByAction(draftStore, backendApplyClient, args, draftId) as unknown as JSONValue
  }

  if (toolName === 'movscript_read_draft') {
    const filePath = draftFilePathArg(args, draftStore)
    if (!filePath) throw new Error('read_draft requires file_path')
    const result = draftStore.readDraftFile(filePath)
    return {
      file_path: result.filePath,
      filePath: result.filePath,
      draft: result.draft,
      content: result.content,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_list_drafts') {
    return {
      drafts: draftStore.listDrafts(normalizeDraftQuery(args)),
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
      ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
    })
    return {
      status: backendCreate.performed ? 'created' : 'skipped',
      projectId,
      script: backendCreate.response ?? null,
      message: backendCreate.performed
        ? 'Formal script record created in the backend project.'
        : 'Formal script creation was skipped.',
      backendCreate,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_search_memories') {
    if (!memoryManager) return { memories: [], count: 0 } as unknown as JSONValue
    const projectId = numberField(args.projectId)
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

  if (toolName === 'movscript_get_memory') {
    if (!memoryManager) return null as unknown as JSONValue
    const projectId = numberField(args.projectId)
    const id = stringField(args.id) ?? stringField(args.memoryId)
    if (projectId === undefined) throw new Error('get_memory requires projectId')
    if (!id) throw new Error('get_memory requires id')
    const memory = memoryManager.getMemory({ projectId, id })
    return (memory ?? null) as unknown as JSONValue
  }

  if (toolName === 'movscript_create_memory') {
    if (!memoryManager) throw new Error('memory manager unavailable')
    const projectId = numberField(args.projectId)
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
    const projectId = numberField(args.projectId)
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
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeProposalDraftKind(value: JSONValue | undefined): AgentDraftKind | undefined {
  return value === 'script_split_proposal'
    || value === 'script'
    || value === 'asset_slot'
    || value === 'storyboard_line'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    || value === 'segment'
    || value === 'scene_moment'
    || value === 'asset_proposal'
    || value === 'project_proposal'
    || value === 'production_proposal'
    || value === 'content_unit_proposal'
    || value === 'content_unit_media_proposal'
    ? value
    : undefined
}

function normalizeProposalDraftContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
}

function validateStructuredProposalDraftContent(kind: AgentDraftKind, content: string): void {
  const requiredSchema = kind === 'script_split_proposal'
    ? DRAFT_CONTENT_SCHEMA_IDS.scriptSplit
    : kind === 'project_proposal'
      ? DRAFT_CONTENT_SCHEMA_IDS.projectProposal
      : kind === 'production_proposal'
        ? DRAFT_CONTENT_SCHEMA_IDS.productionProposal
        : kind === 'asset_proposal'
          ? DRAFT_CONTENT_SCHEMA_IDS.assetProposal
          : kind === 'content_unit_proposal'
            ? DRAFT_CONTENT_SCHEMA_IDS.contentUnitProposal
            : kind === 'content_unit_media_proposal'
              ? DRAFT_CONTENT_SCHEMA_IDS.contentUnitMediaProposal
          : undefined
  if (!requiredSchema) return
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_proposal ${kind} content must be canonical JSON with schema ${requiredSchema}`)
  }
  if (!isRecord(parsed) || parsed.schema !== requiredSchema) {
    throw new Error(`create_proposal ${kind} content must include schema ${requiredSchema}`)
  }
}

function normalizeProposalDraftTarget(value: unknown): AgentDraftTarget | undefined {
  if (!isRecord(value)) return undefined
  const target: AgentDraftTarget = {
    ...(typeof value.entityType === 'string' && value.entityType.trim() ? { entityType: value.entityType.trim() } : {}),
    ...(typeof value.entityId === 'number' || typeof value.entityId === 'string' ? { entityId: value.entityId } : {}),
    ...(typeof value.projectId === 'number' || typeof value.projectId === 'string' ? { projectId: value.projectId } : {}),
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
  const productionId = numberField(args.productionId)
    ?? numberField(args.production_id)
    ?? numberField(context?.productionId)
    ?? numberField(pageContext.pageEntityType === 'production' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_proposal') {
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
  if (kind === 'content_unit_proposal' || kind === 'content_unit_media_proposal') {
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
  const source = isRecord(value) ? { ...value } : {}
  const contextProject = isRecord(context?.project) ? context.project : undefined
  const projectId = numberField(contextProject?.id)
    ?? numberField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
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
  if (kind === 'project_proposal') return `项目提案 - ${projectLabel}`
  if (kind === 'production_proposal') {
    const targetLabel = target?.entityId !== undefined ? `#${String(target.entityId)}` : projectLabel
    return `制作提案 - ${targetLabel}`
  }
  if (kind === 'content_unit_proposal') return `内容单元提案 - ${projectLabel}`
  if (kind === 'content_unit_media_proposal') return `内容单元媒体提案 - ${projectLabel}`
  return `提案草稿 - ${kind}`
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}


function extractPageContext(run: AgentRun): Record<string, JSONValue> {
  const clientInput = isRecord(run.metadata?.clientInput) ? run.metadata.clientInput as Record<string, JSONValue> : undefined
  const uiSnapshot = isRecord(clientInput?.uiSnapshot) ? clientInput.uiSnapshot as Record<string, JSONValue> : undefined
  const pageContext = isRecord(uiSnapshot?.pageContext) ? uiSnapshot.pageContext as Record<string, JSONValue> : undefined
  const route = isRecord(uiSnapshot?.route) ? uiSnapshot.route as Record<string, JSONValue> : undefined
  const selection = isRecord(uiSnapshot?.selection) ? uiSnapshot.selection as Record<string, JSONValue> : undefined
  return {
    ...(typeof pageContext?.pageKey === 'string' ? { pageKey: pageContext.pageKey } : {}),
    ...(typeof pageContext?.pageType === 'string' ? { pageType: pageContext.pageType } : {}),
    ...(typeof pageContext?.pageRoute === 'string' ? { pageRoute: pageContext.pageRoute } : typeof route?.pathname === 'string' ? { pageRoute: route.pathname } : {}),
    ...(typeof pageContext?.pageEntityType === 'string' ? { pageEntityType: pageContext.pageEntityType } : typeof selection?.entityType === 'string' ? { pageEntityType: selection.entityType } : {}),
    ...(typeof pageContext?.pageEntityId === 'number' || typeof pageContext?.pageEntityId === 'string'
      ? { pageEntityId: pageContext.pageEntityId }
      : typeof selection?.entityId === 'number' || typeof selection?.entityId === 'string'
        ? { pageEntityId: selection.entityId }
        : {}),
    ...(typeof pageContext?.draftId === 'string' ? { draftId: pageContext.draftId } : {}),
  }
}

function draftRefArg(args: Record<string, JSONValue>): unknown {
  return stringField(args.draftRef)
    ?? stringField(args.draft_ref)
    ?? stringField(args.draftId)
    ?? stringField(args.draft_id)
    ?? stringField(args.id)
}

function draftFilePathArg(args: Record<string, JSONValue>, draftStore: AgentDraftStore): string | undefined {
  const filePath = stringField(args.file_path)
    ?? stringField(args.filePath)
  if (filePath) return filePath
  const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
  return draftId ? draftStore.getDraftFilePath(draftId) : undefined
}

function createProposalDraft(
  draftStore: AgentDraftStore,
  run: AgentRun,
  args: Record<string, JSONValue>,
): JSONValue {
  const kind = normalizeProposalDraftKind(args.kind)
  if (!kind) throw new Error('create_proposal requires kind')
  const context = isRecord(run.metadata?.context) ? run.metadata.context as Record<string, JSONValue> : undefined
  const pageContext = extractPageContext(run)
  const contextProject = isRecord(context?.project) ? context.project : undefined
  const projectId = numberField(args.projectId)
    ?? numberField(args.project_id)
    ?? numberField(contextProject?.id)
    ?? numberField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_proposal' && projectId === undefined) {
    throw new Error('create_proposal requires projectId for project_proposal')
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
    createdByRunId: run.id,
    createdByThreadId: run.threadId,
    metadata: {
      ...(isRecord(args.metadata) ? args.metadata : {}),
      proposal: true,
      proposalKind: kind,
      producer: 'conversation',
      ...(projectId !== undefined ? { projectId } : {}),
      ...(isRecord(target) ? { target } : {}),
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

function normalizeSourceType(value: JSONValue | undefined): string {
  return value === 'adapted' || value === 'revised' || value === 'raw' ? value : 'raw'
}

function normalizeDraftQuery(args: Record<string, JSONValue>): {
  projectId?: number
  kind?: AgentDraftKind
  status?: AgentDraftStatus
  limit?: number
} {
  return {
    ...(typeof args.projectId === 'number' && Number.isFinite(args.projectId) ? { projectId: args.projectId } : {}),
    ...(isDraftKind(args.kind) ? { kind: args.kind } : {}),
    ...(isDraftStatus(args.status) ? { status: args.status } : {}),
    ...(typeof args.limit === 'number' && Number.isFinite(args.limit) ? { limit: args.limit } : {}),
  }
}

async function updateDraftByAction(
  draftStore: AgentDraftStore,
  backendApplyClient: BackendApplyClient,
  args: Record<string, JSONValue>,
  draftId: string,
): Promise<JSONValue> {
  const action = stringField(args.action) ?? inferDraftUpdateAction(args)
  const current = draftStore.getDraft(draftId)
  if (!current) throw new Error(`draft not found: ${draftId}`)
  if (typeof args.expectedUpdatedAt === 'string' && args.expectedUpdatedAt && args.expectedUpdatedAt !== current.updatedAt) {
    throw new Error(`draft changed since expectedUpdatedAt: ${draftId}`)
  }

  if (action === 'validate') {
    return {
      status: 'validated',
      draft: current,
      validation: validateDraft(current),
    } as unknown as JSONValue
  }

  if (action === 'preview_apply') {
    return previewDraftApply(draftStore, backendApplyClient, current, args)
  }

  if (action === 'patch_content') {
    const result = draftStore.patchDraft(draftId, {
      ops: args.ops,
      expectedUpdatedAt: args.expectedUpdatedAt ?? args.expected_updated_at,
      metadata: args.metadata,
    })
    return {
      status: 'patched',
      ...result,
      validation: validateDraft(result.draft),
    } as unknown as JSONValue
  }

  if (action === 'replace_text') {
    const oldString = stringField(args.oldString ?? args.old_string)
    const newString = typeof (args.newString ?? args.new_string) === 'string' ? String(args.newString ?? args.new_string) : undefined
    if (oldString === undefined) throw new Error('update_draft replace_text requires oldString')
    if (newString === undefined) throw new Error('update_draft replace_text requires newString')
    const replaceAll = args.replaceAll === true || args.replace_all === true
    const count = countTextOccurrences(current.content, oldString)
    if (count === 0) throw new Error('update_draft replace_text oldString was not found')
    if (!replaceAll && count !== 1) throw new Error(`update_draft replace_text oldString is not unique: ${count} matches`)
    const content = replaceAll ? current.content.split(oldString).join(newString) : current.content.replace(oldString, newString)
    const draft = draftStore.updateDraft(draftId, {
      content,
      ...(isRecord(args.metadata) ? { metadata: args.metadata as Record<string, JSONValue> } : {}),
    })
    return {
      status: 'updated',
      replacementCount: replaceAll ? count : 1,
      draft,
      validation: validateDraft(draft),
    } as unknown as JSONValue
  }

  const status = normalizeDraftStatus(args.status)
  const draft = draftStore.updateDraft(draftId, {
    ...(status ? { status } : {}),
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(typeof args.content === 'string' ? { content: args.content } : {}),
    ...(isRecord(args.target) ? { target: args.target } : {}),
    ...(isRecord(args.metadata) ? { metadata: args.metadata as Record<string, JSONValue> } : {}),
    ...(typeof args.rejectedReason === 'string' ? { rejectedReason: args.rejectedReason } : {}),
  })
  return {
    status: 'updated',
    draft,
    validation: validateDraft(draft),
  } as unknown as JSONValue
}

function inferDraftUpdateAction(args: Record<string, JSONValue>): string {
  if (Array.isArray(args.ops)) return 'patch_content'
  if (args.oldString !== undefined || args.old_string !== undefined) return 'replace_text'
  if (args.previewApply === true || args.preview_apply === true) return 'preview_apply'
  if (args.validateOnly === true || args.validate_only === true) return 'validate'
  return 'replace_fields'
}

function countTextOccurrences(text: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let index = 0
  while (true) {
    const next = text.indexOf(needle, index)
    if (next === -1) return count
    count += 1
    index = next + needle.length
  }
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
  if (draft.kind === 'asset_proposal' || draft.kind === 'content_unit_proposal' || draft.kind === 'content_unit_media_proposal' || draft.kind === 'script_split_proposal') {
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
      target: isRecord(args.target) ? args.target : draft.target,
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

function isDraftKind(value: JSONValue | undefined): value is AgentDraftKind {
  return value === 'script_split_proposal'
    || value === 'script'
    || value === 'asset_slot'
    || value === 'storyboard_line'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    || value === 'segment'
    || value === 'scene_moment'
    || value === 'asset_proposal'
    || value === 'project_proposal'
    || value === 'production_proposal'
    || value === 'content_unit_proposal'
    || value === 'content_unit_media_proposal'
}

function isDraftStatus(value: JSONValue | undefined): value is AgentDraftStatus {
  return value === 'draft'
    || value === 'accepted'
    || value === 'rejected'
    || value === 'applied'
    || value === 'superseded'
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

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}
