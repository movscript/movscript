import { isJSONRecord } from '../jsonValue.js'
import type { JSONValue, ToolCall, ToolCallOutcome } from '../state/types.js'

export function buildRollbackRecord(call: ToolCall, result: JSONValue | undefined, sandboxed?: boolean): ToolCallOutcome['rollback'] {
  if (sandboxed || result === undefined) {
    return {
      policy: 'not_applicable',
      reason: sandboxed ? 'Tool call was sandboxed and did not perform side effects.' : 'Tool call produced no durable side effect result.',
    }
  }
  const metadata = isJSONRecord(result) ? result : undefined
  const draftId = metadata
    ? stringField(metadata.draftId)
      ?? stringField(metadata.draftRef)
      ?? stringField(metadata.proposalRef)
      ?? (call.name === 'draft_create' ? stringField(metadata.id) : undefined)
    : undefined
  if (draftId) {
    return {
      policy: 'reversible',
      reason: 'Local draft side effect can be superseded, rejected, or edited before apply.',
      artifactType: 'draft',
      artifactUri: `agent-draft:${draftId}`,
      metadata: { draftId },
    }
  }
  if (isRuntimeStateTool(call.name)) {
    return {
      policy: 'not_applicable',
      reason: 'Runtime state/catalog tools do not perform backend product writes.',
    }
  }
  const backendWritePerformed = metadata && (
    booleanField(metadata.performed)
    || (isJSONRecord(metadata.backendCreate) && booleanField(metadata.backendCreate.performed))
    || (isJSONRecord(metadata.backendApply) && booleanField(metadata.backendApply.performed))
  )
  if (backendWritePerformed || isBackendWriteTool(call.name)) {
    return {
      policy: 'manual_compensation',
      reason: 'Backend write may require a compensating product action; automatic destructive rollback is not available.',
      artifactType: 'backend-write',
      metadata: {
        toolName: call.name,
        ...(metadata ? { result: metadata } : {}),
      },
    }
  }
  return {
    policy: 'not_applicable',
    reason: 'Tool call is read-only or produced no recognized durable write.',
  }
}

function isBackendWriteTool(name: string): boolean {
  return name === 'draft_apply'
    || name.includes('_create_')
    || name.includes('_update_')
    || name.includes('_delete_')
}

function isRuntimeStateTool(name: string): boolean {
  return name === 'core_skill_update'
    || name === 'core_catalog_inspect'
    || name === 'core_update_plan'
    || name === 'core_work_start'
    || name === 'core_work_get'
    || name === 'core_work_list'
    || name === 'core_work_wait'
    || name === 'core_work_cancel'
}

function booleanField(value: unknown): boolean {
  return value === true
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
