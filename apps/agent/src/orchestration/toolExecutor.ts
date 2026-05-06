import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'
import type { AgentRun, ToolCall } from '../state/types.js'
import type { AgentDraftKind, AgentDraftStatus, AgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyClient, BackendApplyResult } from '../drafts/backendApplyClient.js'
import type { ToolRegistry, ToolRiskLevel } from '../tools/toolRegistry.js'
import { buildApplyDraftPreview, markDraftApplied } from '../drafts/draftApply.js'
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
  signal?: AbortSignal
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const { run, mcpClient, draftStore, backendApplyClient, registry, memoryManager, sandboxMode } = options
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
  const runtimeResult = await callRuntimeTool(call.name, args, run, draftStore, backendApplyClient, memoryManager, sandboxMode)
  throwIfAborted(options.signal)
  if (runtimeResult !== undefined) {
    return { call, result: runtimeResult, source: 'runtime' }
  }

  // MCP tools
  throwIfAborted(options.signal)
  await mcpClient.initialize()
  throwIfAborted(options.signal)
  const result = await mcpClient.callTool(call.name, args)
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

  if (toolName === 'movscript_propose_production_entities') {
    const projectId = numberField(args.projectId) ?? numberField(args.project_id)
    const proposalInput = isRecord(args.proposal) ? args.proposal : undefined
    const productionId = numberField(args.productionId)
      ?? numberField(args.production_id)
      ?? numberField(proposalInput?.productionId)
      ?? numberField(proposalInput?.production_id)
    if (projectId === undefined) throw new Error('propose_production_entities requires projectId')
    if (productionId === undefined) throw new Error('propose_production_entities requires productionId')

    const analysisScope = stringField(args.analysisScope) ?? stringField(args.analysis_scope) ?? 'production'
    const normalizedProposal = normalizeProductionProposal(args.proposal, args.candidates)
    const summary = stringField(args.summary) ?? inferProductionProposalSummary(args.proposal)
    const now = new Date().toISOString()
    const supersededDraftIds = supersedeProductionProposalDrafts(draftStore, projectId, productionId, run.id)
    const content = {
      productionId,
      analysisScope,
      ...(summary ? { summary } : {}),
      proposal: normalizedProposal,
      proposedAt: now,
    }
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
      },
      createdByRunId: run.id,
      createdByThreadId: run.threadId,
      metadata: {
        analysisScope,
        productionId,
        supersededDraftIds,
      },
    })
    const counts = countProductionProposalNodes(normalizedProposal)
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    return {
      draftId: draft.id,
      draft,
      status: 'proposed',
      counts,
      supersededDraftIds,
      message: `已写入 ${total} 个候选实体${supersededDraftIds.length > 0 ? `，已替换 ${supersededDraftIds.length} 个旧提案` : ''}`,
    } as unknown as JSONValue
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
          ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
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
      ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
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
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
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
    kind: stringField(value.kind) ?? 'section',
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
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? stringField(value.type) ?? 'shot',
  })
}

function normalizeProposalAssetSlot(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  return withClientId({
    ...value,
    kind: stringField(value.kind) ?? stringField(value.type) ?? 'image',
  })
}

function withClientId(value: Record<string, JSONValue>, fallback?: string): Record<string, JSONValue> {
  const clientId = stringField(value.client_id) ?? stringField(value.local_id) ?? fallback
  return clientId ? { ...value, client_id: clientId } : value
}

function inferProductionProposalSummary(proposal: JSONValue | undefined): string | undefined {
  if (!isRecord(proposal)) return undefined
  const creativeSource = isRecord(proposal.creative_source) ? proposal.creative_source : undefined
  const title = stringField(creativeSource?.title)
  const summary = stringField(creativeSource?.summary)
  return summary ?? title
}

function supersedeProductionProposalDrafts(draftStore: AgentDraftStore, projectId: number, productionId: number, supersededByRunId: string): string[] {
  const now = new Date().toISOString()
  const supersededDraftIds: string[] = []
  const activeDrafts = draftStore.listDrafts({
    projectId,
    kind: 'production_proposal',
    status: 'draft',
    limit: 100,
  })
  for (const draft of activeDrafts) {
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

function countProductionProposalNodes(proposal: Record<string, JSONValue>): Record<string, number> {
  const segments = getRecordArrayValue(proposal.segments)
  const sceneMoments = segments.flatMap((segment) => getRecordArrayValue(segment.scene_moments))
  const contentUnits = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.content_units))
  const creativeReferences = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.creative_references))
  const assetSlots = sceneMoments.flatMap((sceneMoment) => getRecordArrayValue(sceneMoment.asset_slots))
  return {
    segments: segments.length,
    scene_moments: sceneMoments.length,
    content_units: contentUnits.length,
    creative_references: creativeReferences.length,
    asset_slots: assetSlots.length,
  }
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
    || value === 'setting'
    || value === 'asset_slot'
    || value === 'storyboard_line'
    || value === 'content_unit'
    || value === 'prompt'
    || value === 'note'
    || value === 'pipeline'
    || value === 'segment'
    || value === 'scene_moment'
    || value === 'production_proposal'
}

function isDraftStatus(value: JSONValue | undefined): value is AgentDraftStatus {
  return value === 'draft'
    || value === 'accepted'
    || value === 'rejected'
    || value === 'applied'
    || value === 'superseded'
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}
