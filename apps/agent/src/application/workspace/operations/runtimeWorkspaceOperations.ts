import { isRecord } from '../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { AgentWorkspace, AgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import { validateWorkspace } from '../../../workspaces/store/workspaceStore.js'
import { buildApplyWorkspacePreview, markWorkspaceApplied, rejectWorkspace, type ApplyWorkspaceInput } from '../../../workspaces/apply/workspaceApply.js'
import {
  buildRuntimeCreateWorkspaceInput,
  buildRuntimeWorkspaceBackendAuth,
  buildRuntimeUpdateWorkspaceInput,
  requireRuntimeWorkspaceId,
  type RuntimeCreateWorkspaceInput,
  type RuntimeUpdateWorkspaceInput,
} from '../../../workspaces/runtime/input/workspaceRuntimeInput.js'
import { normalizeWorkspaceQuery } from '../../../context/input/run/normalizeRunInput.js'
import type { RuntimeWorkspaceBackendApplyPort } from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'

export function listRuntimeWorkspaces(input: {
  workspaceStore: AgentWorkspaceStore
  query?: Parameters<typeof normalizeWorkspaceQuery>[0]
}): AgentWorkspace[] {
  return input.workspaceStore.listWorkspaces(normalizeWorkspaceQuery(input.query ?? {}))
}

export function createRuntimeLocalWorkspace(input: {
  workspaceStore: AgentWorkspaceStore
  workspaceInput: RuntimeCreateWorkspaceInput
}): AgentWorkspace {
  return input.workspaceStore.createWorkspace(buildRuntimeCreateWorkspaceInput(input.workspaceInput))
}

export function getRuntimeWorkspace(input: {
  workspaceStore: AgentWorkspaceStore
  workspaceId: string
}): AgentWorkspace | undefined {
  return input.workspaceStore.getWorkspace(input.workspaceId)
}

export function updateRuntimeWorkspace(input: {
  workspaceStore: AgentWorkspaceStore
  workspaceInput: RuntimeUpdateWorkspaceInput
}): AgentWorkspace {
  const { workspaceId, update } = buildRuntimeUpdateWorkspaceInput(input.workspaceInput)
  return input.workspaceStore.updateWorkspace(workspaceId, update)
}

export function previewRuntimeWorkspaceApply(input: {
  workspaceStore: AgentWorkspaceStore
  applyInput: ApplyWorkspaceInput
}): JSONValue {
  return buildApplyWorkspacePreview(input.workspaceStore, input.applyInput) as unknown as JSONValue
}

export async function simulateRuntimeWorkspaceApply(input: {
  workspaceStore: AgentWorkspaceStore
  backendApplyPort: Pick<RuntimeWorkspaceBackendApplyPort, 'previewApplyReview'>
  applyInput: ApplyWorkspaceInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
}): Promise<JSONValue> {
  const preview = buildApplyWorkspacePreview(input.workspaceStore, input.applyInput)
  const validation = validateWorkspace(preview.workspace)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      workspaceId: preview.workspace.id,
      validation,
      message: 'Workspace failed local validation. Patch the workspace and validate again before asking MCP to validate effects.',
    } as unknown as JSONValue
  }
  const previewResult = await input.backendApplyPort.previewApplyReview(
    preview.review,
    buildRuntimeWorkspaceBackendAuth(input.applyInput),
  )
  if (previewResult.ok) {
    return {
      ok: true,
      stage: 'mcp_apply_preview',
      workspaceId: preview.workspace.id,
      validation,
      backendApply: previewResult.backendApply,
    } as unknown as JSONValue
  }
  return {
    ok: false,
    stage: 'mcp_apply_preview',
    workspaceId: preview.workspace.id,
    validation,
    error: previewResult.error,
    ...(previewResult.backendError !== undefined ? { backendError: previewResult.backendError } : {}),
    message: 'MCP apply preview failed. Update the workspace and validate again.',
  } as unknown as JSONValue
}

export async function applyRuntimeWorkspaceFromUI(input: {
  workspaceStore: AgentWorkspaceStore
  backendApplyPort: Pick<RuntimeWorkspaceBackendApplyPort, 'applyReview'>
  applyInput: ApplyWorkspaceInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  now: () => string
  appliedBy?: string
}): Promise<JSONValue> {
  const appliedBy = input.appliedBy ?? 'ui'
  const preview = buildApplyWorkspacePreview(input.workspaceStore, input.applyInput)
  let backendApply: Awaited<ReturnType<RuntimeWorkspaceBackendApplyPort['applyReview']>>
  try {
    backendApply = await input.backendApplyPort.applyReview(preview.review, buildRuntimeWorkspaceBackendAuth(input.applyInput, {
      includeAppliedByUserId: true,
    }))
  } catch (error) {
    input.workspaceStore.updateWorkspace(preview.workspace.id, {
      metadata: {
        ...(isRecord(preview.workspace.metadata) ? preview.workspace.metadata : {}),
        backendWritePerformed: false,
        backendWriteError: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }

  const finalWorkspace = markWorkspaceApplied(input.workspaceStore, preview.workspace, preview.review, input.applyInput, {
    appliedBy,
    backendWritePerformed: backendApply.performed,
    backendApply: backendApply as unknown as JSONValue,
    appliedAt: input.now(),
  })
  return {
    status: 'applied',
    review: preview.review,
    workspace: finalWorkspace,
    message: backendApply.performed
      ? 'Workspace applied through MCP.'
      : 'Workspace apply recorded locally; MCP reported no backend write.',
    backendApply,
  } as unknown as JSONValue
}

export function rejectRuntimeWorkspace(input: {
  workspaceStore: AgentWorkspaceStore
  workspaceId?: unknown
  reason?: unknown
}): AgentWorkspace {
  return rejectWorkspace(input.workspaceStore, input.workspaceId, input.reason)
}

export function requireRuntimeWorkspace(input: {
  workspaceStore: AgentWorkspaceStore
  workspaceId?: unknown
}): AgentWorkspace {
  const workspaceId = requireRuntimeWorkspaceId(input.workspaceId, 'read_workspace')
  const workspace = input.workspaceStore.getWorkspace(workspaceId)
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`)
  return workspace
}
