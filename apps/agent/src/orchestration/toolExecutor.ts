import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'
import type { AgentRun, ToolCall } from '../state/types.js'
import { buildApplyDraftPreview } from '../drafts/draftApply.js'
import { normalizeDraftStatus, validateDraft, type AgentDraftKind, type AgentDraftStatus, type AgentDraftStore } from '../drafts/draftStore.js'
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
  const result = await mcpClient.callTool(runtimeToolName(call.name), translateToolArgsForRuntime(call.name, args), { signal: options.signal })
  throwIfAborted(options.signal)
  return { call, result, source: 'mcp' }
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

  if (toolName === 'movscript_edit_draft') {
    const filePath = draftFilePathArg(args, draftStore)
    if (!filePath) throw new Error('edit_draft requires file_path')
    const result = draftStore.editDraftFile(filePath, {
      oldString: args.old_string ?? args.oldString,
      newString: args.new_string ?? args.newString,
      replaceAll: args.replace_all ?? args.replaceAll,
    })
    return {
      status: 'edited',
      file_path: result.filePath,
      filePath: result.filePath,
      replacementCount: result.replacementCount,
      draft: result.draft,
      validation: validateDraft(result.draft),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_dry_apply_draft') {
    const filePath = draftFilePathArg(args, draftStore)
    if (!filePath) throw new Error('dry_apply_draft requires file_path')
    const readResult = draftStore.readDraftFile(filePath)
    const draft = readResult.draft
    const validation = validateDraft(draft)
    if (!validation.ok) {
      return {
        ok: false,
        stage: 'local_validation',
        file_path: readResult.filePath,
        filePath: readResult.filePath,
        draftId: draft.id,
        validation,
        message: 'Draft failed local validation. Edit the draft and dry apply again.',
      } as unknown as JSONValue
    }
    if (draft.kind === 'asset_proposal') {
      return {
        ok: true,
        stage: 'local_validation',
        file_path: readResult.filePath,
        filePath: readResult.filePath,
        draftId: draft.id,
        validation,
        message: 'Asset proposal draft is locally valid. It is a planning artifact; backend apply is intentionally not performed.',
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
        file_path: readResult.filePath,
        filePath: readResult.filePath,
        draftId: draft.id,
        validation,
        review: preview.review,
        backendApply: backendApply as unknown as JSONValue,
      } as unknown as JSONValue
    } catch (error) {
      return {
        ok: false,
        stage: 'backend_apply_preview',
        file_path: readResult.filePath,
        filePath: readResult.filePath,
        draftId: draft.id,
        validation,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        message: 'Backend apply preview failed. Edit the draft and dry apply again.',
      } as unknown as JSONValue
    }
  }

  if (toolName === 'movscript_submit_script_split_draft') {
    return submitScriptSplitDraft(draftStore, run, args) as unknown as JSONValue
  }

  if (toolName === 'movscript_preview_production_proposal_apply') {
    const proposalRef = proposalRefArgWithPageContext(args, run)
    const draft = requireProductionProposalDraft(draftStore, proposalRef)
    const content = parseProductionProposalDraftContent(draft)
    const projectId = numberField(args.projectId) ?? numberField(args.project_id) ?? draft.projectId
    if (projectId === undefined) throw new Error('preview_production_proposal_apply requires projectId')
    const payload: Record<string, JSONValue> = {
      production_id: content.productionId,
      productionId: content.productionId,
      analysis_scope: content.analysisScope ?? stringField(args.analysisScope) ?? stringField(args.analysis_scope) ?? 'production',
      analysisScope: content.analysisScope ?? stringField(args.analysisScope) ?? stringField(args.analysis_scope) ?? 'production',
      proposal: content.proposal,
    }
    if (content.summary) payload.summary = content.summary
    try {
      const backendApply = await backendApplyClient.previewProductionProposalApply(projectId, payload, {
        ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
        ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
      })
      return {
        ok: true,
        stage: 'backend_apply_preview',
        draftId: draft.id,
        proposalRef: draft.id,
        projectId,
        productionId: content.productionId,
        backendApply,
        message: 'Production proposal backend preview completed.',
      } as unknown as JSONValue
    } catch (error) {
      return {
        ok: false,
        stage: 'backend_apply_preview',
        draftId: draft.id,
        proposalRef: draft.id,
        projectId,
        productionId: content.productionId,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        message: 'Production proposal backend preview failed. Patch the draft and simulate again.',
      } as unknown as JSONValue
    }
  }

  if (toolName === 'movscript_create_production_proposal') {
    const pageContext = extractPageContext(run)
    const pageDraftId = typeof pageContext.draftId === 'string' ? pageContext.draftId : undefined
    const projectId = numberField(args.projectId) ?? numberField(args.project_id)
    const productionId = numberField(args.productionId) ?? numberField(args.production_id)
    if (projectId === undefined) throw new Error('create_production_proposal requires projectId')
    if (productionId === undefined) throw new Error('create_production_proposal requires productionId')
    const analysisScope = stringField(args.analysisScope) ?? stringField(args.analysis_scope) ?? 'production'
    const summary = stringField(args.summary)
    const now = new Date().toISOString()
    const content = {
      productionId,
      analysisScope,
      ...(summary ? { summary } : {}),
      proposal: { segments: [] },
      proposedAt: now,
    }
    if (pageDraftId) {
      const existingDraft = draftStore.getDraft(pageDraftId)
      if (existingDraft) {
        const supersededDraftIds = supersedeProductionProposalDrafts(draftStore, projectId, productionId, run.id, pageDraftId)
        const draft = draftStore.updateDraft(existingDraft.id, {
          status: 'draft',
          title: stringField(args.title) ?? `制作编排提案 - ${analysisScope}`,
          content: JSON.stringify(content),
          metadata: {
            ...(existingDraft.metadata ?? {}),
            analysisScope,
            productionId,
            supersededDraftIds,
          },
        })
        return {
          proposalRef: draft.id,
          draftRef: draft.id,
          draftId: draft.id,
          draft,
          status: 'updated',
          counts: countProductionProposalNodes((content.proposal as Record<string, JSONValue>)),
          supersededDraftIds,
        } as unknown as JSONValue
      }
    }
    const supersededDraftIds = supersedeProductionProposalDrafts(draftStore, projectId, productionId, run.id)
    const draft = draftStore.createDraft({
      projectId,
      kind: 'production_proposal',
      title: stringField(args.title) ?? `制作编排提案 - ${analysisScope}`,
      content: JSON.stringify(content),
      source: {
        entityType: 'production',
        entityId: productionId,
        runId: run.id,
        threadId: run.threadId,
        ...extractPageContext(run),
      },
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: {
        analysisScope,
        productionId,
        supersededDraftIds,
        ...(pageDraftId ? { stalePageDraftId: pageDraftId } : {}),
      },
    })
    return {
      proposalRef: draft.id,
      draftRef: draft.id,
      draftId: draft.id,
      draft,
      status: 'created',
      counts: countProductionProposalNodes((content.proposal as Record<string, JSONValue>)),
      supersededDraftIds,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_get_production_proposal') {
    const draft = requireProductionProposalDraft(draftStore, proposalRefArgWithPageContext(args, run))
    return {
      draftRef: draft.id,
      proposalRef: draft.id,
      draft,
      content: parseProductionProposalDraftContent(draft),
      counts: countProductionProposalNodes(parseProductionProposalDraftContent(draft).proposal),
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_inspect_production_proposal_context') {
    const context = isRecord(run.metadata?.context) ? run.metadata.context as Record<string, JSONValue> : undefined
    const contextProject = isRecord(context?.project) ? context.project : undefined
    const productionId = numberField(args.productionId)
      ?? numberField(args.production_id)
      ?? numberField(context?.productionId)
    const projectId = numberField(args.projectId)
      ?? numberField(args.project_id)
      ?? numberField(contextProject?.id)
    const explicitDraftId = proposalRefArgWithPageContext(args, run)
    const pageContext = extractPageContext(run)
    const pageDraftId = typeof pageContext.draftId === 'string' ? pageContext.draftId : undefined
    const draft = explicitDraftId
      ? draftStore.getDraft(String(explicitDraftId))
      : pageDraftId
        ? draftStore.getDraft(pageDraftId)
        : findLatestProductionProposalDraft(draftStore, projectId, productionId)
    const content = draft ? parseProductionProposalDraftContent(draft) : undefined
    const nodeType = normalizeProposalNodeType(args.nodeType ?? args.node_type)
    const includeNodes = args.includeNodes !== false && args.include_nodes !== false
    const nodes = content && includeNodes
      ? listProductionProposalNodes(content.proposal).filter((node) => !nodeType || node.nodeType === nodeType)
      : []
    return {
      project: contextProject ?? null,
      productionId: productionId ?? content?.productionId ?? null,
      userRequest: typeof run.metadata?.userRequest === 'string' ? run.metadata.userRequest : null,
      attachments: Array.isArray(context?.attachments) ? context.attachments : [],
      recentResources: Array.isArray(context?.recentResources) ? context.recentResources : [],
      statusDigest: Array.isArray(context?.statusDigest) ? context.statusDigest : [],
      rawContextHints: Array.isArray(context?.rawContextHints) ? context.rawContextHints : [],
      currentSelection: isRecord(context?.selection) ? context.selection : null,
      proposalRef: draft?.id ?? null,
      draft: draft ?? null,
      content: content ?? null,
      nodes,
      counts: content ? countProductionProposalNodes(content.proposal) : null,
    } as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_segment') {
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'segment', args.segment, undefined, 'segment') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_scene_moment') {
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'scene_moment', args.sceneMoment ?? args.scene_moment, args.segment, 'scene_moment') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_reference') {
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'creative_reference', args.reference, args.sceneMoment ?? args.scene_moment, 'creative_reference') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_asset') {
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'asset_slot', args.asset, args.sceneMoment ?? args.scene_moment, 'asset_slot') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_content_unit') {
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'content_unit', args.contentUnit ?? args.content_unit, args.sceneMoment ?? args.scene_moment, 'content_unit') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_keyframe') {
    const parent = isRecord(args.shot) ? args.shot : args.sceneMoment ?? args.scene_moment
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'keyframe', args.keyframe, parent, 'keyframe') as unknown as JSONValue
  }

  if (toolName === 'movscript_upsert_proposal_shot') {
    const shot = isRecord(args.shot) ? { ...args.shot, kind: stringField(args.shot.kind) ?? 'shot' } : args.shot
    return upsertProductionProposalBusinessNode(draftStore, run, args, 'content_unit', shot, args.sceneMoment ?? args.scene_moment, 'shot') as unknown as JSONValue
  }

  if (toolName === 'movscript_create_production_proposal_from_items' || toolName === 'movscript_propose_production_entities' || toolName === 'movscript_submit_production_proposal') {
    const pageContext = extractPageContext(run)
    const pageDraftId = typeof pageContext.draftId === 'string' ? pageContext.draftId : undefined
    const projectId = numberField(args.projectId) ?? numberField(args.project_id)
    const proposalInput = isRecord(args.proposal) ? args.proposal : undefined
    const productionId = numberField(args.productionId)
      ?? numberField(args.production_id)
      ?? numberField(proposalInput?.productionId)
      ?? numberField(proposalInput?.production_id)
    if (projectId === undefined) throw new Error('create_production_proposal_from_items requires projectId')
    if (productionId === undefined) throw new Error('create_production_proposal_from_items requires productionId')

    const analysisScope = stringField(args.analysisScope) ?? stringField(args.analysis_scope) ?? 'production'
    const normalizedProposal = normalizeProductionProposal(args.proposal, args.candidates)
    const summary = stringField(args.summary) ?? inferProductionProposalSummary(args.proposal)
    const now = new Date().toISOString()
    const content = {
      productionId,
      analysisScope,
      ...(summary ? { summary } : {}),
      proposal: normalizedProposal,
      proposedAt: now,
    }
    if (pageDraftId) {
      const existingDraft = draftStore.getDraft(pageDraftId)
      if (existingDraft) {
        const supersededDraftIds = supersedeProductionProposalDrafts(draftStore, projectId, productionId, run.id, pageDraftId)
        const draft = draftStore.updateDraft(existingDraft.id, {
          status: 'draft',
          title: `制作编排提案 - ${analysisScope}`,
          content: JSON.stringify(content),
          metadata: {
            ...(existingDraft.metadata ?? {}),
            analysisScope,
            productionId,
            supersededDraftIds,
          },
        })
        const counts = countProductionProposalNodes(normalizedProposal)
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
        return {
          proposalRef: draft.id,
          draftRef: draft.id,
          draftId: draft.id,
          draft,
          status: 'updated',
          counts,
          supersededDraftIds,
          message: `已更新 ${total} 个候选业务项`,
        } as unknown as JSONValue
      }
    }
    const supersededDraftIds = supersedeProductionProposalDrafts(draftStore, projectId, productionId, run.id)
    const draft = draftStore.createDraft({
      projectId,
      kind: 'production_proposal',
      title: `制作编排提案 - ${analysisScope}`,
      content: JSON.stringify(content),
      source: {
        entityType: 'production',
        entityId: productionId,
        runId: run.id,
        threadId: run.threadId,
        ...extractPageContext(run),
      },
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: {
        analysisScope,
        productionId,
        supersededDraftIds,
        ...(pageDraftId ? { stalePageDraftId: pageDraftId } : {}),
      },
    })
    const counts = countProductionProposalNodes(normalizedProposal)
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    return {
      proposalRef: draft.id,
      draftRef: draft.id,
      draftId: draft.id,
      draft,
      status: 'proposed',
      counts,
      supersededDraftIds,
      message: `已写入 ${total} 个候选业务项${supersededDraftIds.length > 0 ? `，已替换 ${supersededDraftIds.length} 个旧提案` : ''}`,
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

  if (toolName === 'movscript_list_memories') {
    if (!memoryManager) return { memories: [], count: 0 } as unknown as JSONValue
    const projectId = numberField(args.projectId)
    if (projectId === undefined) throw new Error('list_memories requires projectId')
    const memories = memoryManager.listMemorySummaries({
      projectId,
      kind: normalizeMemoryKind(args.kind),
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })
    return {
      memories,
      count: memories.length,
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

function submitScriptSplitDraft(
  draftStore: AgentDraftStore,
  run: AgentRun,
  args: Record<string, JSONValue>,
): JSONValue {
  const pageContext = extractPageContext(run)
  const pageDraftId = typeof pageContext.draftId === 'string' ? pageContext.draftId : undefined
  const projectId = numberField(args.projectId) ?? numberField(args.project_id)
  if (projectId === undefined) throw new Error('submit_script_split_draft requires projectId')

  const sourceTitle = stringField(args.sourceTitle) ?? stringField(args.source_title)
  const sourceSummary = stringField(args.sourceSummary) ?? stringField(args.source_summary) ?? `${sourceTitle ?? '源剧本'}按行号拆分。`
  const sourceScript = isRecord(args.sourceScript) ? args.sourceScript : isRecord(args.source_script) ? args.source_script : undefined
  const globalSettings = isRecord(args.globalSettings) ? args.globalSettings : isRecord(args.global_settings) ? args.global_settings : {}
  const episodeDrafts = Array.isArray(args.episodeDrafts) ? args.episodeDrafts : Array.isArray(args.episode_drafts) ? args.episode_drafts : undefined
  if (!sourceTitle) throw new Error('submit_script_split_draft requires sourceTitle')
  if (!episodeDrafts || episodeDrafts.length === 0) throw new Error('submit_script_split_draft requires episodeDrafts')
  rejectScriptSplitBodyText(args, 'args')
  if (sourceScript) rejectScriptSplitBodyText(sourceScript, 'sourceScript')
  episodeDrafts.forEach((episode, index) => rejectScriptSplitBodyText(episode, `episodeDrafts[${index}]`))

  const sourceLineCount = numberField(args.lineCount)
    ?? numberField(args.line_count)
    ?? (sourceScript ? numberField(sourceScript.lineCount) : undefined)
    ?? (sourceScript ? numberField(sourceScript.line_count) : undefined)
  if (!sourceLineCount || sourceLineCount <= 0) throw new Error('submit_script_split_draft requires lineCount')
  const normalizedGlobalSettings = normalizeScriptSplitGlobalSettings(globalSettings)
  const normalizedEpisodes = episodeDrafts.flatMap((episode, index) => {
    const normalized = normalizeScriptSplitEpisodeDraft(episode, index, sourceLineCount)
    return normalized ? [normalized] : []
  })
  if (normalizedEpisodes.length === 0) throw new Error('submit_script_split_draft requires at least one valid episodeDraft')

  const content = {
    schema: 'movscript.script_split_analysis.v1',
    source_title: sourceTitle,
    source_summary: sourceSummary,
    source_script: normalizeScriptSplitSourceScript(sourceScript ?? {}, sourceTitle, sourceSummary, sourceLineCount),
    global_settings: normalizedGlobalSettings,
    episode_drafts: normalizedEpisodes,
    ...(Array.isArray(args.warnings) ? { warnings: args.warnings.flatMap((warning) => stringField(warning) ? [stringField(warning)!] : []) } : { warnings: [] }),
    ...(typeof args.confidence === 'number' && Number.isFinite(args.confidence) ? { confidence: args.confidence } : { confidence: 0 }),
  }
  const draftTitle = stringField(args.draftTitle) ?? stringField(args.draft_title) ?? `剧本拆分草稿 - ${sourceTitle}`
  const sourceScriptTitle = sourceScript ? stringField(sourceScript.title) ?? sourceTitle : sourceTitle
  if (pageDraftId) {
    const existingDraft = draftStore.getDraft(pageDraftId)
    if (!existingDraft) throw new Error(`draft not found: ${pageDraftId}`)
    const draft = draftStore.updateDraft(existingDraft.id, {
      title: draftTitle,
      content: JSON.stringify(content, null, 2),
      metadata: {
        ...(existingDraft.metadata ?? {}),
        analysisScope: 'script_split',
        sourceTitle,
        sourceSummary,
        episodeCount: normalizedEpisodes.length,
      },
    })
    return {
      status: 'updated',
      draftRef: draft.id,
      draftId: draft.id,
      draft,
      supersededDraftIds: [],
      validation: validateDraft(draft),
    } as unknown as JSONValue
  }
  const supersededDraftIds = supersedeScriptSplitDrafts(draftStore, projectId, sourceScriptTitle, run.id)
  const draft = draftStore.createDraft({
    projectId,
    kind: 'script_split',
    title: draftTitle,
    content: JSON.stringify(content, null, 2),
    source: {
      entityType: 'script_split',
      entityId: sourceScriptTitle,
      runId: run.id,
      threadId: run.threadId,
      sourceType: 'raw',
      ...extractPageContext(run),
    },
    createdByRunId: run.id,
    createdByThreadId: run.threadId,
    metadata: {
      sourceTitle,
      sourceSummary,
      episodeCount: normalizedEpisodes.length,
      supersededDraftIds,
    },
  })
  return {
    status: 'created',
    draftRef: draft.id,
    draftId: draft.id,
    draft,
    supersededDraftIds,
    validation: validateDraft(draft),
  } as unknown as JSONValue
}

function normalizeScriptSplitSourceScript(
  sourceScript: Record<string, JSONValue>,
  fallbackTitle: string,
  fallbackSummary: string,
  lineCount: number,
): Record<string, JSONValue> {
  return {
    title: stringField(sourceScript.title) ?? fallbackTitle,
    summary: stringField(sourceScript.summary) ?? fallbackSummary,
    source_type: normalizeSourceType(sourceScript.sourceType ?? sourceScript.source_type),
    line_count: Math.max(1, Math.floor(lineCount)),
  }
}

function normalizeScriptSplitEpisodeDraft(value: unknown, index: number, sourceLineCount: number): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const title = stringField(value.title) ?? `第${numberField(value.order) ?? index + 1}集`
  const summary = stringField(value.summary) ?? `源剧本第${normalizeLineNumber(value.startLine ?? value.start_line ?? value.start) ?? index + 1}行至第${normalizeLineNumber(value.endLine ?? value.end_line ?? value.end) ?? normalizeLineNumber(value.startLine ?? value.start_line ?? value.start) ?? index + 1}行。`
  const globalContext = isRecord(value.globalContext) ? value.globalContext : isRecord(value.global_context) ? value.global_context : undefined
  const action = value.action === 'update' ? 'update' : 'create'
  const existingScriptId = numberField(value.existingScriptId) ?? numberField(value.existing_script_id) ?? null
  const existingProductionId = numberField(value.existingProductionId) ?? numberField(value.existing_production_id) ?? null
  const productionActionValue = stringField(value.productionAction) ?? stringField(value.production_action) ?? ''
  const productionAction = productionActionValue === 'update' || productionActionValue === 'skip' ? productionActionValue : 'create'
  const productionTitle = stringField(value.productionTitle) ?? stringField(value.production_title) ?? title
  const productionSummary = stringField(value.productionSummary) ?? stringField(value.production_summary) ?? summary
  const startLine = normalizeLineNumber(value.startLine ?? value.start_line ?? value.start) ?? index + 1
  const endLine = normalizeLineNumber(value.endLine ?? value.end_line ?? value.end)
  if (!endLine) throw new Error(`submit_script_split_draft episodeDrafts[${index}] requires endLine`)
  return {
    order: numberField(value.order) ?? index + 1,
    title,
    summary,
    global_context: normalizeScriptSplitGlobalContext(globalContext ?? {}),
    start_line: clampLineNumber(startLine, sourceLineCount),
    end_line: clampLineNumber(Math.max(startLine, endLine), sourceLineCount),
    action,
    existing_script_id: existingScriptId,
    production_action: productionAction,
    existing_production_id: existingProductionId,
    production_title: productionTitle,
    production_summary: productionSummary,
  }
}

function normalizeScriptSplitGlobalSettings(value: Record<string, JSONValue>): Record<string, JSONValue> {
  return {
    story_world: stringField(value.storyWorld) ?? stringField(value.story_world) ?? '',
    core_rules: stringArrayField(value.coreRules ?? value.core_rules),
    character_relationships: stringArrayField(value.characterRelationships ?? value.character_relationships),
    key_characters: stringArrayField(value.keyCharacters ?? value.key_characters),
    key_locations: stringArrayField(value.keyLocations ?? value.key_locations),
    key_props: stringArrayField(value.keyProps ?? value.key_props),
    continuity_notes: stringArrayField(value.continuityNotes ?? value.continuity_notes),
  }
}

function normalizeScriptSplitGlobalContext(value: Record<string, JSONValue>): Record<string, JSONValue> {
  return {
    ...normalizeScriptSplitGlobalSettings(value),
    episode_relevance: stringArrayField(value.episodeRelevance ?? value.episode_relevance),
  }
}

function rejectScriptSplitBodyText(value: unknown, path: string): void {
  if (!isRecord(value)) return
  for (const key of ['content', 'text', 'body', 'rawText', 'raw_text', 'sourceText', 'source_text']) {
    if (stringField(value[key])) {
      throw new Error(`submit_script_split_draft ${path}.${key} is not allowed; use lineCount/startLine/endLine instead of passing long text`)
    }
  }
}

function stringArrayField(value: JSONValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const text = stringField(item)
      return text ? [text] : []
    })
  }
  const text = stringField(value)
  return text ? text.split(/\r?\n|[；;]/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : []
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

function normalizeLineNumber(value: JSONValue | undefined): number | undefined {
  const parsed = numberField(value)
  if (parsed === undefined) return undefined
  const line = Math.floor(parsed)
  return line > 0 ? line : undefined
}

function clampLineNumber(value: number, maxLine: number): number {
  const line = Math.max(1, Math.floor(value))
  return maxLine > 0 ? Math.min(line, Math.floor(maxLine)) : line
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

function normalizeProductionProposal(proposal: JSONValue | undefined, candidates: JSONValue | undefined): Record<string, JSONValue> {
  if (isRecord(proposal)) {
    const inner = isRecord(proposal.proposal) ? proposal.proposal : proposal
    const segments = Array.isArray(inner.segments) ? inner.segments : []
    return {
      ...inner,
      segments: segments.flatMap((segment) => {
        const normalized = normalizeProposalSegment(segment)
        return normalized ? [normalized] : []
      }),
    } as Record<string, JSONValue>
  }
  if (isRecord(candidates)) {
    return {
      segments: Array.isArray(candidates.segments)
        ? candidates.segments.flatMap((segment) => {
            const normalized = normalizeProposalSegment(segment)
            return normalized ? [normalized] : []
          })
        : [],
    }
  }
  return { segments: [] }
}

function normalizeProposalSegment(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const sceneMoments = Array.isArray(value.scene_moments) ? value.scene_moments : []
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? 'emotional_function',
    scene_moments: sceneMoments.flatMap((sceneMoment) => {
      const normalized = normalizeProposalSceneMoment(sceneMoment)
      return normalized ? [normalized] : []
    }),
  })
}

function normalizeProposalSceneMoment(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const creativeReferences = Array.isArray(value.creative_references) ? value.creative_references : []
  const contentUnits = Array.isArray(value.content_units) ? value.content_units : []
  const assetSlots = Array.isArray(value.asset_slots) ? value.asset_slots : []
  const keyframes = Array.isArray(value.keyframes) ? value.keyframes : []
  return withClientId({
    ...value,
    creative_references: creativeReferences.flatMap((reference) => {
      const normalized = normalizeProposalCreativeReference(reference)
      return normalized ? [normalized] : []
    }),
    content_units: contentUnits.flatMap((unit) => {
      const normalized = normalizeProposalContentUnit(unit)
      return normalized ? [normalized] : []
    }),
    asset_slots: assetSlots.flatMap((slot) => {
      const normalized = normalizeProposalAssetSlot(slot)
      return normalized ? [normalized] : []
    }),
    keyframes: keyframes.flatMap((keyframe) => {
      const normalized = normalizeProposalKeyframe(keyframe)
      return normalized ? [normalized] : []
    }),
  })
}

function normalizeProposalCreativeReference(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? stringField(value.type) ?? 'character',
  }, stringField(value.canonical_reference_id))
}

function normalizeProposalContentUnit(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const keyframes = Array.isArray(value.keyframes) ? value.keyframes : []
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? stringField(value.type) ?? 'shot',
    keyframes: keyframes.flatMap((keyframe) => {
      const normalized = normalizeProposalKeyframe(keyframe)
      return normalized ? [normalized] : []
    }),
  })
}

function normalizeProposalAssetSlot(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? stringField(value.type) ?? 'image',
  })
}

function normalizeProposalKeyframe(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  return withClientId({
    ...value,
    kind: 'keyframe',
  })
}

function withClientId(value: Record<string, JSONValue>, fallback?: string): Record<string, JSONValue> {
  const clientId = stringField(value.localRef)
    ?? stringField(value.client_id)
    ?? stringField(value.local_id)
    ?? fallback
  return clientId ? { ...value, localRef: clientId, client_id: clientId } : value
}

function inferProductionProposalSummary(proposal: JSONValue | undefined): string | undefined {
  if (!isRecord(proposal)) return undefined
  const creativeSource = isRecord(proposal.creative_source) ? proposal.creative_source : undefined
  const title = stringField(creativeSource?.title)
  const summary = stringField(creativeSource?.summary)
  return summary ?? title
}

function supersedeProductionProposalDrafts(draftStore: AgentDraftStore, projectId: number, productionId: number, supersededByRunId: string, exceptDraftId?: string): string[] {
  const now = new Date().toISOString()
  const supersededDraftIds: string[] = []
  const activeDrafts = draftStore.listDrafts({
    projectId,
    kind: 'production_proposal',
    status: 'draft',
    limit: 100,
  })
  for (const draft of activeDrafts) {
    if (exceptDraftId && draft.id === exceptDraftId) continue
    if (draft.source?.entityType !== 'production') continue
    if (String(draft.source.entityId) !== String(productionId)) continue
    draftStore.updateDraft(draft.id, {
      status: 'superseded',
      metadata: {
        supersededByRunId,
        supersededAt: now,
      },
    })
    supersededDraftIds.push(draft.id)
  }
  return supersededDraftIds
}

function supersedeScriptSplitDrafts(draftStore: AgentDraftStore, projectId: number, sourceTitle: string, supersededByRunId: string): string[] {
  const now = new Date().toISOString()
  const supersededDraftIds: string[] = []
  const activeDrafts = draftStore.listDrafts({
    projectId,
    kind: 'script_split',
    status: 'draft',
    limit: 100,
  })
  for (const draft of activeDrafts) {
    if (draft.source?.entityType !== 'script_split') continue
    if (String(draft.source.entityId ?? '') !== sourceTitle) continue
    draftStore.updateDraft(draft.id, {
      status: 'superseded',
      metadata: {
        supersededByRunId,
        supersededAt: now,
      },
    })
    supersededDraftIds.push(draft.id)
  }
  return supersededDraftIds
}

function countProductionProposalNodes(proposal: Record<string, JSONValue>): Record<string, number> {
  const segments = getRecordArrayValue(proposal.segments)
  const sceneMoments = segments.flatMap((segment) => getRecordArrayValue(segment.scene_moments))
  const contentUnits = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.content_units))
  const creativeReferences = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.creative_references))
  const assetSlots = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.asset_slots))
  const keyframes = [
    ...sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.keyframes)),
    ...contentUnits.flatMap((contentUnit) => getRecordArrayValue(contentUnit.keyframes)),
  ]
  return {
    segments: segments.length,
    scene_moments: sceneMoments.length,
    content_units: contentUnits.length,
    creative_references: creativeReferences.length,
    asset_slots: assetSlots.length,
    keyframes: keyframes.length,
  }
}

type ProductionProposalNodeType = 'segment' | 'scene_moment' | 'content_unit' | 'creative_reference' | 'asset_slot' | 'keyframe'

interface ProductionProposalDraftContent {
  productionId: number
  analysisScope?: string
  summary?: string
  proposal: Record<string, JSONValue>
  proposedAt?: string
}

interface ProductionProposalNodeSummary {
  nodeType: ProductionProposalNodeType
  path: string
  parentPath?: string
  parentClientId?: string
  id?: number
  localRef?: string
  client_id?: string
  action?: string
  title?: string
  name?: string
  kind?: string
  order?: number
}

function requireProductionProposalDraft(draftStore: AgentDraftStore, draftIdValue: unknown) {
  const draftId = stringField(draftIdValue as JSONValue | undefined)
  if (!draftId) throw new Error('production proposal tool requires proposalRef')
  const draft = draftStore.getDraft(draftId)
  if (!draft) throw new Error(`draft not found: ${draftId}`)
  if (draft.kind !== 'production_proposal') throw new Error(`draft is not a production_proposal: ${draftId}`)
  return draft
}

function parseProductionProposalDraftContent(draft: { content: string }): ProductionProposalDraftContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(draft.content)
  } catch {
    throw new Error('production_proposal draft content must be JSON')
  }
  if (!isRecord(parsed)) throw new Error('production_proposal draft content must be an object')
  const productionId = numberField(parsed.productionId) ?? numberField(parsed.production_id)
  if (productionId === undefined) throw new Error('production_proposal draft content requires productionId')
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : { segments: [] }
  if (!Array.isArray(proposal.segments)) proposal.segments = []
  return {
    productionId,
    ...(stringField(parsed.analysisScope) ?? stringField(parsed.analysis_scope) ? { analysisScope: stringField(parsed.analysisScope) ?? stringField(parsed.analysis_scope) } : {}),
    ...(stringField(parsed.summary) ? { summary: stringField(parsed.summary) } : {}),
    proposal,
    ...(stringField(parsed.proposedAt) ?? stringField(parsed.proposed_at) ? { proposedAt: stringField(parsed.proposedAt) ?? stringField(parsed.proposed_at) } : {}),
  }
}

function normalizeProposalNodeType(value: JSONValue | undefined): ProductionProposalNodeType | undefined {
  return value === 'segment'
    || value === 'scene_moment'
    || value === 'content_unit'
    || value === 'creative_reference'
    || value === 'asset_slot'
    || value === 'keyframe'
    ? value
    : undefined
}

function normalizeProposalNodeForType(nodeType: ProductionProposalNodeType, value: JSONValue | undefined): Record<string, JSONValue> {
  let normalized: Record<string, JSONValue> | undefined
  if (nodeType === 'segment') normalized = normalizeProposalSegment(value)
  if (nodeType === 'scene_moment') normalized = normalizeProposalSceneMoment(value)
  if (nodeType === 'content_unit') normalized = normalizeProposalContentUnit(value)
  if (nodeType === 'creative_reference') normalized = normalizeProposalCreativeReference(value)
  if (nodeType === 'asset_slot') normalized = normalizeProposalAssetSlot(value)
  if (nodeType === 'keyframe') normalized = normalizeProposalKeyframe(value)
  if (!normalized) throw new Error(`invalid ${nodeType} node`)
  normalized.action = stringField(normalized.action) ?? 'create'
  return normalized
}

function proposalRefArg(args: Record<string, JSONValue>): unknown {
  return args.proposalRef ?? args.proposal_ref ?? args.draftRef ?? args.draft_ref ?? args.draftId ?? args.draft_id
}

function proposalRefArgWithPageContext(args: Record<string, JSONValue>, run: AgentRun): unknown {
  const explicit = proposalRefArg(args)
  if (explicit) return explicit
  return extractPageContext(run).draftId
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

function listProductionProposalNodes(proposal: Record<string, JSONValue>): ProductionProposalNodeSummary[] {
  const nodes: ProductionProposalNodeSummary[] = []
  const segments = getRecordArrayValue(proposal.segments)
  segments.forEach((segment, segmentIndex) => {
    const segmentPath = `/proposal/segments/${segmentIndex}`
    nodes.push(nodeSummary('segment', segment, segmentPath))
    getRecordArrayValue(segment.scene_moments).forEach((sceneMoment, sceneMomentIndex) => {
      const sceneMomentPath = `${segmentPath}/scene_moments/${sceneMomentIndex}`
      nodes.push(nodeSummary('scene_moment', sceneMoment, sceneMomentPath, segmentPath, nodeLocalRef(segment)))
      getRecordArrayValue(sceneMoment.content_units).forEach((contentUnit, contentUnitIndex) => {
        nodes.push(nodeSummary('content_unit', contentUnit, `${sceneMomentPath}/content_units/${contentUnitIndex}`, sceneMomentPath, nodeLocalRef(sceneMoment)))
      })
      getRecordArrayValue(sceneMoment.creative_references).forEach((reference, referenceIndex) => {
        nodes.push(nodeSummary('creative_reference', reference, `${sceneMomentPath}/creative_references/${referenceIndex}`, sceneMomentPath, nodeLocalRef(sceneMoment)))
      })
      getRecordArrayValue(sceneMoment.asset_slots).forEach((slot, slotIndex) => {
        nodes.push(nodeSummary('asset_slot', slot, `${sceneMomentPath}/asset_slots/${slotIndex}`, sceneMomentPath, nodeLocalRef(sceneMoment)))
      })
      getRecordArrayValue(sceneMoment.keyframes).forEach((keyframe, keyframeIndex) => {
        nodes.push(nodeSummary('keyframe', keyframe, `${sceneMomentPath}/keyframes/${keyframeIndex}`, sceneMomentPath, nodeLocalRef(sceneMoment)))
      })
      getRecordArrayValue(sceneMoment.content_units).forEach((contentUnit, contentUnitIndex) => {
        const contentUnitPath = `${sceneMomentPath}/content_units/${contentUnitIndex}`
        getRecordArrayValue(contentUnit.keyframes).forEach((keyframe, keyframeIndex) => {
          nodes.push(nodeSummary('keyframe', keyframe, `${contentUnitPath}/keyframes/${keyframeIndex}`, contentUnitPath, nodeLocalRef(contentUnit)))
        })
      })
    })
  })
  return nodes
}

function nodeSummary(
  nodeType: ProductionProposalNodeType,
  node: Record<string, JSONValue>,
  path: string,
  parentPath?: string,
  parentClientId?: string,
): ProductionProposalNodeSummary {
  return {
    nodeType,
    path,
    ...(parentPath ? { parentPath } : {}),
    ...(parentClientId ? { parentClientId } : {}),
    ...(numberField(node.id) !== undefined ? { id: numberField(node.id) } : {}),
    ...(nodeLocalRef(node) ? { localRef: nodeLocalRef(node) } : {}),
    ...(stringField(node.client_id) ? { client_id: stringField(node.client_id) } : {}),
    ...(stringField(node.action) ? { action: stringField(node.action) } : {}),
    ...(stringField(node.title) ? { title: stringField(node.title) } : {}),
    ...(stringField(node.name) ? { name: stringField(node.name) } : {}),
    ...(stringField(node.kind) ? { kind: stringField(node.kind) } : {}),
    ...(numberField(node.order) !== undefined ? { order: numberField(node.order) } : {}),
  }
}

function nodeLocalRef(node: Record<string, JSONValue>): string | undefined {
  return stringField(node.localRef) ?? stringField(node.client_id) ?? stringField(node.local_id)
}

function upsertProductionProposalNode(
  proposal: Record<string, JSONValue>,
  nodeType: ProductionProposalNodeType,
  node: Record<string, JSONValue>,
  parent: Record<string, JSONValue> | undefined,
  position?: number,
): { created: boolean; node: Record<string, JSONValue>; path: string } {
  const target = findProductionProposalNode(proposal, nodeType, {
    id: numberField(node.id),
    clientId: nodeLocalRef(node),
  })
  if (target) {
    Object.assign(target.node, node)
    return { created: false, node: target.node, path: target.path }
  }

  const container = resolveProposalContainer(proposal, nodeType, parent)
  const index = position === undefined ? container.items.length : Math.max(0, Math.min(Math.floor(position), container.items.length))
  container.items.splice(index, 0, node)
  return { created: true, node, path: `${container.path}/${index}` }
}

function upsertProductionProposalBusinessNode(
  draftStore: AgentDraftStore,
  run: AgentRun,
  args: Record<string, JSONValue>,
  nodeType: ProductionProposalNodeType,
  rawNode: JSONValue | undefined,
  rawParent: JSONValue | undefined,
  label: string,
): JSONValue {
  const draft = requireProductionProposalDraft(draftStore, proposalRefArgWithPageContext(args, run))
  const node = normalizeProposalNodeForType(nodeType, rawNode)
  const parent = isRecord(rawParent) ? rawParent : undefined
  const content = parseProductionProposalDraftContent(draft)
  const upsert = upsertProductionProposalNode(content.proposal, nodeType, node, parent, numberField(args.position))
  const updated = draftStore.updateDraft(draft.id, {
    content: JSON.stringify(content),
    metadata: {
      ...(isRecord(draft.metadata) ? draft.metadata : {}),
      lastProposalNodeMutation: {
        op: upsert.created ? 'create' : 'update',
        nodeType,
        label,
        path: upsert.path,
        mutatedAt: new Date().toISOString(),
      },
    },
  })
  const updatedContent = parseProductionProposalDraftContent(updated)
  return {
    status: upsert.created ? 'created' : 'updated',
    proposalRef: updated.id,
    draft: updated,
    node: upsert.node,
    path: upsert.path,
    counts: countProductionProposalNodes(updatedContent.proposal),
  } as unknown as JSONValue
}

function resolveProposalContainer(
  proposal: Record<string, JSONValue>,
  nodeType: ProductionProposalNodeType,
  parent: Record<string, JSONValue> | undefined,
): { items: Record<string, JSONValue>[]; path: string } {
  if (nodeType === 'segment') return { items: mutableRecordArray(proposal, 'segments'), path: '/proposal/segments' }

  if (!parent) throw new Error(`${nodeType} upsert requires parent`)
  if (nodeType === 'scene_moment') {
    const segment = findProductionProposalNode(proposal, 'segment', {
      id: numberField(parent.id),
      clientId: stringField(parent.client_id) ?? stringField(parent.clientId),
      path: stringField(parent.path),
    })
    if (!segment) throw new Error('parent segment not found')
    return { items: mutableRecordArray(segment.node, 'scene_moments'), path: `${segment.path}/scene_moments` }
  }

  const sceneMoment = findProductionProposalNode(proposal, 'scene_moment', {
    id: numberField(parent.id),
    clientId: stringField(parent.client_id) ?? stringField(parent.clientId),
    path: stringField(parent.path),
  })
  if (!sceneMoment && nodeType === 'keyframe') {
    const contentUnit = findProductionProposalNode(proposal, 'content_unit', {
      id: numberField(parent.id),
      clientId: stringField(parent.client_id) ?? stringField(parent.clientId),
      path: stringField(parent.path),
    })
    if (!contentUnit) throw new Error('parent scene_moment or shot not found')
    return { items: mutableRecordArray(contentUnit.node, 'keyframes'), path: `${contentUnit.path}/keyframes` }
  }
  if (!sceneMoment) throw new Error('parent scene_moment not found')
  if (nodeType === 'keyframe') return { items: mutableRecordArray(sceneMoment.node, 'keyframes'), path: `${sceneMoment.path}/keyframes` }
  const key = childArrayKeyForNodeType(nodeType)
  return { items: mutableRecordArray(sceneMoment.node, key), path: `${sceneMoment.path}/${key}` }
}

function childArrayKeyForNodeType(nodeType: ProductionProposalNodeType): 'content_units' | 'creative_references' | 'asset_slots' {
  if (nodeType === 'content_unit') return 'content_units'
  if (nodeType === 'creative_reference') return 'creative_references'
  if (nodeType === 'asset_slot') return 'asset_slots'
  throw new Error(`${nodeType} has no scene_moment child container`)
}

function findProductionProposalNode(
  proposal: Record<string, JSONValue>,
  nodeType: ProductionProposalNodeType,
  locator: { id?: number; clientId?: string; path?: string },
): ({ nodeType: ProductionProposalNodeType; node: Record<string, JSONValue>; path: string; items: Record<string, JSONValue>[]; index: number } | undefined) {
  if (locator.path) return iterateProductionProposalNodeRefs(proposal).find((candidate) => candidate.path === locator.path)
  for (const candidate of iterateProductionProposalNodeRefs(proposal)) {
    if (candidate.nodeType !== nodeType) continue
    if (locator.id !== undefined && numberField(candidate.node.id) === locator.id) return candidate
    if (locator.clientId && stringField(candidate.node.client_id) === locator.clientId) return candidate
  }
  return undefined
}

function iterateProductionProposalNodeRefs(proposal: Record<string, JSONValue>): Array<{
  nodeType: ProductionProposalNodeType
  node: Record<string, JSONValue>
  path: string
  items: Record<string, JSONValue>[]
  index: number
}> {
  const refs: Array<{
    nodeType: ProductionProposalNodeType
    node: Record<string, JSONValue>
    path: string
    items: Record<string, JSONValue>[]
    index: number
  }> = []
  const segments = mutableRecordArray(proposal, 'segments')
  segments.forEach((segment, segmentIndex) => {
    const segmentPath = `/proposal/segments/${segmentIndex}`
    refs.push({ nodeType: 'segment', node: segment, path: segmentPath, items: segments, index: segmentIndex })
    const sceneMoments = mutableRecordArray(segment, 'scene_moments')
    sceneMoments.forEach((sceneMoment, sceneMomentIndex) => {
      const sceneMomentPath = `${segmentPath}/scene_moments/${sceneMomentIndex}`
      refs.push({ nodeType: 'scene_moment', node: sceneMoment, path: sceneMomentPath, items: sceneMoments, index: sceneMomentIndex })
      const childSpecs: Array<[ProductionProposalNodeType, 'content_units' | 'creative_references' | 'asset_slots' | 'keyframes']> = [
        ['content_unit', 'content_units'],
        ['creative_reference', 'creative_references'],
        ['asset_slot', 'asset_slots'],
        ['keyframe', 'keyframes'],
      ]
      for (const [childType, childKey] of childSpecs) {
        const children = mutableRecordArray(sceneMoment, childKey)
        children.forEach((child, childIndex) => {
          refs.push({ nodeType: childType, node: child, path: `${sceneMomentPath}/${childKey}/${childIndex}`, items: children, index: childIndex })
          if (childType === 'content_unit') {
            const keyframes = mutableRecordArray(child, 'keyframes')
            keyframes.forEach((keyframe, keyframeIndex) => {
              refs.push({ nodeType: 'keyframe', node: keyframe, path: `${sceneMomentPath}/${childKey}/${childIndex}/keyframes/${keyframeIndex}`, items: keyframes, index: keyframeIndex })
            })
          }
        })
      }
    })
  })
  return refs
}

function mutableRecordArray(owner: Record<string, JSONValue>, key: string): Record<string, JSONValue>[] {
  const current = owner[key]
  if (!Array.isArray(current)) {
    const next: Record<string, JSONValue>[] = []
    owner[key] = next
    return next
  }
  const records = current.filter((item): item is Record<string, JSONValue> => isRecord(item))
  if (records.length !== current.length) {
    owner[key] = records
    return records
  }
  return current as Record<string, JSONValue>[]
}

function findLatestProductionProposalDraft(draftStore: AgentDraftStore, projectId?: number, productionId?: number) {
  const drafts = draftStore.listDrafts({
    ...(typeof projectId === 'number' ? { projectId } : {}),
    kind: 'production_proposal',
    status: 'draft',
    limit: 100,
  })
  return drafts.find((draft) => {
    if (productionId === undefined) return true
    if (draft.source?.entityType === 'production' && String(draft.source.entityId) === String(productionId)) return true
    try {
      return parseProductionProposalDraftContent(draft).productionId === productionId
    } catch {
      return false
    }
  })
}

function getRecordArrayValue(value: JSONValue | undefined): Array<Record<string, JSONValue>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, JSONValue> => isRecord(item))
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isRecord(value) && Object.values(value).every(isJSONValue)
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

function isDraftKind(value: JSONValue | undefined): value is AgentDraftKind {
  return value === 'script'
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
