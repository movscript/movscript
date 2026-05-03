import type { MCPClient } from '../../mcpClient.js'
import type { JSONValue } from '../types.js'
import type { AgentRun, ToolCall } from '../types.js'
import type { AgentDraftStore } from '../store/draftStore.js'
import type { BackendApplyClient, BackendApplyResult } from '../store/backendApplyClient.js'
import type { ToolRegistry, ToolRiskLevel } from '../tools/toolRegistry.js'
import { buildApplyDraftPreview, markDraftApplied } from '../store/draftApply.js'

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
  sandboxMode: boolean
}

export async function executeTool(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  const { run, mcpClient, draftStore, backendApplyClient, registry, sandboxMode } = options
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
  const runtimeResult = await callRuntimeTool(call.name, args, run, draftStore, backendApplyClient, sandboxMode)
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
        typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string' ? appliedByUserId : undefined,
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

function normalizeDraftQuery(args: Record<string, JSONValue>): {
  projectId?: number
  limit?: number
} {
  return {
    ...(typeof args.projectId === 'number' && Number.isFinite(args.projectId) ? { projectId: args.projectId } : {}),
    ...(typeof args.limit === 'number' && Number.isFinite(args.limit) ? { limit: args.limit } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
