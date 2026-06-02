import { buildApplyWorkspacePreview } from '../../../../workspaces/apply/workspaceApply.js'
import { validateWorkspace, type AgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'

export function createWorkspaceApplyToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['workspace_validate', 'workspace_apply'],
    async execute({ call, args, run, workspaceStore, workspaceApplyPort, workspaceApplyPreviewPort }) {
      if (call.name === 'workspace_validate') {
        const workspaceId = stringField(workspaceRefArg(args) as JSONValue | undefined)
        if (!workspaceId) throw new Error('workspace_validate requires workspaceId')
        const workspace = workspaceStore.getWorkspace(workspaceId)
        if (!workspace) throw new Error(`workspace not found: ${workspaceId}`)
        const result = await previewWorkspaceApply(workspaceStore, workspaceApplyPreviewPort, workspace, args)
        return {
          result: workspaceApplyResult(result, workspaceId, 'validate'),
        }
      }

      if (call.name === 'workspace_apply') {
        const workspaceId = stringField(workspaceRefArg(args) as JSONValue | undefined)
        if (!workspaceId) throw new Error('workspace_apply requires workspaceId')
        const workspace = workspaceStore.getWorkspace(workspaceId)
        if (!workspace) throw new Error(`workspace not found: ${workspaceId}`)
        const validation = validateWorkspace(workspace)
        if (!validation.ok) {
          const validationResult = {
            ok: false,
            stage: 'local_validation',
            workspaceId,
            validation,
            message: 'Workspace failed local validation. Patch the workspace and validate again before applying.',
          } as unknown as JSONValue
          return { result: workspaceApplyResult(validationResult, workspaceId, 'apply') }
        }
        const user = userFromRunContext(run)
        const applyResult = await workspaceApplyPort.apply({
          workspaceStore,
          applyInput: {
            workspaceId: workspaceId,
            target: isJSONRecord(args.target) ? args.target : workspace.target,
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
        const toolResult = {
          ok: true,
          stage: 'apply',
          validation,
          ...(isJSONRecord(applyResult) ? applyResult : { result: applyResult }),
        } as unknown as JSONValue
        return { result: workspaceApplyResult(toolResult, workspaceId, 'apply') }
      }

      return undefined
    },
  }
}

async function previewWorkspaceApply(
  workspaceStore: AgentWorkspaceStore,
  workspaceApplyPreviewPort: WorkspaceApplyPreviewPort,
  workspace: NonNullable<ReturnType<AgentWorkspaceStore['getWorkspace']>>,
  args: Record<string, JSONValue>,
): Promise<JSONValue> {
  const validation = validateWorkspace(workspace)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      workspaceId: workspace.id,
      validation,
      message: 'Workspace failed local validation. Update the workspace and validate again.',
    } as unknown as JSONValue
  }
  if (workspace.kind === 'asset_workspace' || workspace.kind === 'content_unit_workspace') {
    return {
      ok: true,
      stage: 'local_validation',
      workspaceId: workspace.id,
      validation,
      message: 'Workspace is locally valid. Backend validation is intentionally not performed for this kind yet.',
    } as unknown as JSONValue
  }
  const preview = buildApplyWorkspacePreview(workspaceStore, {
    workspaceId: workspace.id,
    target: isJSONRecord(args.target) ? args.target : workspace.target,
    targetEntityType: args.targetEntityType ?? args.target_entity_type,
    targetEntityId: args.targetEntityId ?? args.target_entity_id,
    targetField: args.targetField ?? args.target_field,
    currentValue: args.currentValue ?? args.current_value,
    proposedValue: args.proposedValue ?? args.proposed_value,
  })
  const backendPreview = await workspaceApplyPreviewPort.previewApplyReview(preview.review)
  if (backendPreview.ok) {
    return {
      ok: true,
      stage: 'backend_apply_preview',
      workspaceId: workspace.id,
      validation,
      review: preview.review,
      backendApply: backendPreview.backendApply,
    } as unknown as JSONValue
  }
  return {
    ok: false,
    stage: 'backend_apply_preview',
    workspaceId: workspace.id,
    validation,
    error: backendPreview.error,
    ...(backendPreview.backendError !== undefined ? { backendError: backendPreview.backendError } : {}),
    message: 'Backend validation failed. Update the workspace and validate again.',
  } as unknown as JSONValue
}

function workspaceRefArg(args: Record<string, JSONValue>): unknown {
  return workspaceRefStringField(args.workspaceRef)
    ?? workspaceRefStringField(args.workspace_ref)
    ?? workspaceRefStringField(args.workspaceId)
    ?? workspaceRefStringField(args.workspace_id)
    ?? workspaceRefStringField(args.id)
}

function workspaceRefStringField(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const workspaceMatch = /^agent:\/\/workspace\/([^/]+)/.exec(trimmed)
    if (workspaceMatch?.[1]) return decodeURIComponent(workspaceMatch[1])
  }
  return stringField(value)
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function userFromRunContext(run: AgentRun): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  return isJSONRecord(context?.user) ? context.user : undefined
}

function workspaceApplyResult(value: JSONValue, workspaceId: string, operation: 'validate' | 'apply'): JSONValue {
  if (!isJSONRecord(value)) return value
  const { review: _review, ...rest } = value
  const rawMessage = typeof value.message === 'string' ? value.message : undefined
  return {
    ...rest,
    workspaceId,
    stage: operation === 'validate'
      ? workspaceValidationStage(stringField(value.stage))
      : workspaceApplyStage(stringField(value.stage)),
    ...(rawMessage ? { message: workspaceMessage(rawMessage) } : {}),
  } as unknown as JSONValue
}

function workspaceValidationStage(stage: string | undefined): string {
  if (stage === 'backend_apply_preview') return 'backend_validation'
  return stage ?? 'validation'
}

function workspaceApplyStage(stage: string | undefined): string {
  return stage ?? 'apply'
}

function workspaceMessage(message: string): string {
  return message
    .replace(/\bWorkspace\b/g, 'Workspace')
    .replace(/\bworkspace\b/g, 'workspace')
    .replace(/apply-preview dry-run/g, 'validation')
}
