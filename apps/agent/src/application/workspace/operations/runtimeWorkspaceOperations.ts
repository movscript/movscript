import { isRecord } from '../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../shared/protocol/types.js'
import type { AgentWorkspace, AgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import { validateWorkspace } from '../../../workspaces/store/workspaceStore.js'
import { buildApplyWorkspacePreview, markWorkspaceApplied, rejectWorkspace, type ApplyWorkspaceInput, type ApplyWorkspaceReview } from '../../../workspaces/apply/workspaceApply.js'
import {
  assetWorkspaceContainsAssetSlots,
  canonicalizeProjectStandardsWorkspaceWorkspaceContent,
} from '../../../workspaces/runtime/content/workspaceRuntimeContent.js'
import {
  buildRuntimeCreateWorkspaceInput,
  buildRuntimeWorkspaceBackendAuth,
  buildRuntimeUpdateWorkspaceInput,
  requireRuntimeWorkspaceId,
  type RuntimeCreateWorkspaceInput,
  type RuntimeUpdateWorkspaceInput,
} from '../../../workspaces/runtime/input/workspaceRuntimeInput.js'
import { normalizeWorkspaceQuery } from '../../../context/input/run/normalizeRunInput.js'
import type { RuntimeWorkspaceBackendApplyPort, RuntimeWorkspaceBackendApplyResult } from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'

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
  const preparedReview = buildRuntimeProjectLayerWorkspaceReviewForBackend(preview.review, input.workspaceStore)
  const validation = validateWorkspace(preview.workspace)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      workspaceId: preview.workspace.id,
      validation,
      message: 'Workspace failed local validation. Patch the workspace and validate again before simulating backend apply.',
    } as unknown as JSONValue
  }
  if (isAssetPlanningWorkspace(preview.workspace)) {
    return {
      ok: true,
      stage: 'local_validation',
      workspaceId: preview.workspace.id,
      validation,
      message: 'Asset workspace workspace is locally valid. It is a planning artifact; backend apply is intentionally not performed.',
    } as unknown as JSONValue
  }
  const previewResult = await input.backendApplyPort.previewApplyReview(
    preparedReview,
    buildRuntimeWorkspaceBackendAuth(input.applyInput),
  )
  if (previewResult.ok) {
    return {
      ok: true,
      stage: 'backend_apply_preview',
      workspaceId: preview.workspace.id,
      validation,
      backendApply: previewResult.backendApply,
    } as unknown as JSONValue
  }
  return {
    ok: false,
    stage: 'backend_apply_preview',
    workspaceId: preview.workspace.id,
    validation,
    error: previewResult.error,
    ...(previewResult.backendError !== undefined ? { backendError: previewResult.backendError } : {}),
    message: 'Backend apply preview failed. Use backendError.response or backendError.responseText to edit the workspace, then simulate again.',
  } as unknown as JSONValue
}

export async function applyRuntimeWorkspaceFromUI(input: {
  workspaceStore: AgentWorkspaceStore
  backendApplyPort: Pick<RuntimeWorkspaceBackendApplyPort, 'applyReview'>
  applyInput: ApplyWorkspaceInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  now: () => string
  appliedBy?: string
}): Promise<JSONValue> {
  const appliedBy = input.appliedBy ?? 'movscript-ui'
  const preview = buildApplyWorkspacePreview(input.workspaceStore, input.applyInput)
  const preparedReview = buildRuntimeProjectLayerWorkspaceReviewForBackend(preview.review, input.workspaceStore)
  if (isAssetPlanningWorkspace(preview.workspace)) {
    const finalWorkspace = markWorkspaceApplied(input.workspaceStore, preview.workspace, preparedReview, input.applyInput, {
      appliedBy,
      backendWritePerformed: false,
      backendApplySkippedReason: 'asset workspace contains candidate plans only; project snapshot apply was skipped',
    })
    return {
      status: 'applied',
      review: preparedReview,
      workspace: finalWorkspace,
      message: 'Asset candidate planning workspace apply recorded. Backend project snapshot apply was skipped.',
      backendApply: { performed: false, skippedReason: 'asset workspace contains candidate plans only' },
    } as unknown as JSONValue
  }
  let backendApply: RuntimeWorkspaceBackendApplyResult
  try {
    backendApply = await input.backendApplyPort.applyReview(preparedReview, buildRuntimeWorkspaceBackendAuth(input.applyInput, {
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

  const rebasedContent = canonicalizeProjectStandardsWorkspaceWorkspaceContent(preview.workspace, backendApply)
  const nextCreativeReferenceClientIDMap = prepareProjectLayerWorkspaceClientIDMap(preparedReview, backendApply, preview.workspace)
  const mergedCreativeReferenceClientIDMap = mergeCreativeReferenceClientIDMap(
    isRecord(preview.workspace.metadata) ? normalizeClientIDMap(preview.workspace.metadata.creativeReferenceClientIDMap) : {},
    nextCreativeReferenceClientIDMap ?? {},
  )
  const rebasedWorkspace = rebasedContent
    ? input.workspaceStore.updateWorkspace(preview.workspace.id, {
        content: rebasedContent,
        metadata: {
          canonicalizedAfterApply: true,
          canonicalizedAt: input.now(),
        },
      })
    : preview.workspace
  const finalWorkspace = markWorkspaceApplied(input.workspaceStore, rebasedWorkspace, preparedReview, input.applyInput, {
    appliedBy,
    backendWritePerformed: backendApply.performed,
    backendApply: backendApply as unknown as JSONValue,
    ...(Object.keys(mergedCreativeReferenceClientIDMap).length > 0 ? {
      creativeReferenceClientIDMap: mergedCreativeReferenceClientIDMap,
    } : {}),
    ...(rebasedContent ? { canonicalizedAfterApply: true } : {}),
  })
  return {
    status: 'applied',
    review: preparedReview,
    workspace: finalWorkspace,
    message: backendApply.performed
      ? 'Workspace applied by UI and backend business item patch completed.'
      : 'Workspace apply recorded by UI. Backend business item patch was skipped.',
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

function isAssetPlanningWorkspace(workspace: AgentWorkspace): boolean {
  if (workspace.kind !== 'asset_workspace' || assetWorkspaceContainsAssetSlots(workspace.content)) return false
  const parsed = parseJSONTextAsRecord(workspace.content)
  const workspacePayload = isRecord(parsed?.workspace) ? parsed.workspace : undefined
  const candidatePlans = Array.isArray(workspacePayload?.candidate_plans) ? workspacePayload.candidate_plans : []
  const legacyCandidates = Array.isArray(workspacePayload?.candidates) ? workspacePayload.candidates : []
  return candidatePlans.length > 0 || legacyCandidates.length > 0
}

function buildRuntimeProjectLayerWorkspaceReviewForBackend(review: ApplyWorkspaceReview, workspaceStore: AgentWorkspaceStore): ApplyWorkspaceReview {
  if (!isRecord(review) || review.workspaceKind !== 'asset_workspace' || !isRecord(review.target)) {
    return review
  }
  const projectID = resolveWorkspaceProjectId(review.target)
  if (!projectID) return review
  const ownerIDByClientID = getCreativeReferenceIDMapFromProjectWorkspaces(workspaceStore, projectID)
  if (Object.keys(ownerIDByClientID).length === 0) return review
  const reviewProposedValue = parseJSONTextAsRecord(review.proposedValue)
  const workspacePayload = isRecord(reviewProposedValue?.workspace) ? reviewProposedValue.workspace : undefined
  if (!isRecord(workspacePayload)) return review
  const assetSlots = Array.isArray(workspacePayload.asset_slots) ? workspacePayload.asset_slots : []
  if (assetSlots.length === 0) return review
  let rewritten = false
  const nextAssetSlots = assetSlots.map((slot) => {
    if (!isRecord(slot)) return slot
    const owner = isRecord(slot.owner) ? slot.owner : undefined
    const hasCreativeOwnerType = readText(owner?.type) === 'creative_reference' || readText(slot.owner_type) === 'creative_reference'
    const ownerID = readPositiveInt(owner?.id) ?? readPositiveInt(slot.owner_id)
    const creativeReferenceClientID = firstMatchingClientID([
      owner?.client_id,
      ownerID === undefined ? owner?.id : undefined,
      hasCreativeOwnerType ? slot.creative_reference_id : undefined,
      hasCreativeOwnerType ? slot.owner_id : undefined,
    ], ownerIDByClientID)
    if (ownerID !== undefined && !creativeReferenceClientID) return slot
    if (!creativeReferenceClientID) return slot
    const resolved = ownerIDByClientID[creativeReferenceClientID]
    if (!resolved) return slot
    if (owner) {
      rewritten = true
      return {
        ...slot,
        owner: {
          ...owner,
          type: hasCreativeOwnerType ? readText(owner.type) : 'creative_reference',
          id: resolved,
        },
      }
    }
    rewritten = true
    return {
      ...slot,
      owner_type: 'creative_reference',
      creative_reference_id: resolved,
      owner_id: resolved,
    }
  })
  if (!rewritten) return review
  return {
    ...review,
    proposedValue: {
      ...(reviewProposedValue ?? {}),
      workspace: {
        ...workspacePayload,
        asset_slots: nextAssetSlots,
      },
    },
  } as typeof review
}

function getCreativeReferenceIDMapFromProjectWorkspaces(workspaceStore: AgentWorkspaceStore, projectID: number): Record<string, number> {
  const settings = workspaceStore.listWorkspaces({ projectId: projectID, kind: 'setting_workspace' })
  if (settings.length === 0) return {}
  const mergedByClientID: Record<string, { referenceID: number; updatedAt: string; createdAt: string; index: number }> = {}
  for (const [index, workspace] of settings.entries()) {
    if (!isRecord(workspace.metadata)) continue
    const map = normalizeClientIDMap(workspace.metadata.creativeReferenceClientIDMap)
    for (const [clientID, referenceID] of Object.entries(map)) {
      const current = mergedByClientID[clientID]
      const candidateUpdatedAt = workspace.updatedAt
      const candidateCreatedAt = workspace.createdAt
      if (!current) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateUpdatedAt > current.updatedAt) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateUpdatedAt < current.updatedAt) continue
      if (candidateCreatedAt > current.createdAt) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
        continue
      }
      if (candidateCreatedAt < current.createdAt) continue
      if (index > current.index) {
        mergedByClientID[clientID] = { referenceID, updatedAt: candidateUpdatedAt, createdAt: candidateCreatedAt, index }
      }
    }
  }
  const merged: Record<string, number> = {}
  for (const [clientID, value] of Object.entries(mergedByClientID)) {
    merged[clientID] = value.referenceID
  }
  return merged
}

function firstMatchingClientID(values: unknown[], referenceMap: Record<string, number>): string {
  for (const value of values) {
    const candidate = readClientID(value)
    if (!candidate) continue
    if (Object.hasOwn(referenceMap, candidate)) return candidate
  }
  return ''
}

function normalizeClientIDMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, rawReferenceID] of Object.entries(value)) {
    const clientID = readClientID(key)
    const referenceID = readPositiveInt(rawReferenceID)
    if (!clientID || referenceID === undefined) continue
    out[clientID] = referenceID
  }
  return out
}

function mergeCreativeReferenceClientIDMap(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  if (Object.keys(left).length === 0) return { ...right }
  if (Object.keys(right).length === 0) return { ...left }
  return { ...left, ...right }
}

function prepareProjectLayerWorkspaceClientIDMap(
  review: ApplyWorkspaceReview,
  backendApply: RuntimeWorkspaceBackendApplyResult,
  workspace: AgentWorkspace,
): Record<string, number> | undefined {
  if (review.workspaceKind !== 'setting_workspace') return undefined
  if (!isRecord(review.target)) return undefined
  const reviewProposedValue = parseJSONTextAsRecord(review.proposedValue)
  const workspacePayload = isRecord(reviewProposedValue?.workspace) ? reviewProposedValue.workspace : undefined
  if (!isRecord(workspacePayload)) return undefined
  const requestedRefs = Array.isArray(workspacePayload.creative_references) ? workspacePayload.creative_references : []
  if (!isRecord(backendApply.response)) return undefined
  const snapshotRefs = normalizeCreativeReferenceSnapshot(backendApply.response)
  if (requestedRefs.length === 0 || snapshotRefs.length === 0) return undefined
  const sourceMap = isRecord(workspace.metadata) ? normalizeClientIDMap(workspace.metadata.creativeReferenceClientIDMap) : {}
  const nextMap = buildClientIDToReferenceIDMap(requestedRefs, snapshotRefs)
  return {
    ...sourceMap,
    ...nextMap,
  }
}

function buildClientIDToReferenceIDMap(requestedRefs: unknown[], snapshotRefs: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {}
  const usedRefIDs = new Set<number>()
  for (const requestedRef of requestedRefs) {
    if (!isRecord(requestedRef)) continue
    const clientID = readClientID(requestedRef.client_id)
    if (!clientID) continue
    const directID = readPositiveInt(requestedRef.id)
    if (directID !== undefined && directID > 0) {
      out[clientID] = directID
      usedRefIDs.add(directID)
      continue
    }
    const targetName = readText(requestedRef.name)
    const targetKind = readText(requestedRef.kind)
    const targetAlias = readText(requestedRef.alias)
    const matched = snapshotRefs.find((snapshotRef) => {
      if (!isRecord(snapshotRef)) return false
      const snapshotID = readPositiveInt(snapshotRef.id)
      if (snapshotID === undefined || usedRefIDs.has(snapshotID)) return false
      const snapshotName = readText(snapshotRef.name)
      const snapshotKind = readText(snapshotRef.kind)
      const snapshotAlias = readText(snapshotRef.alias)
      return snapshotName === targetName && snapshotKind === targetKind && (targetAlias === '' || targetAlias === snapshotAlias)
    })
    if (!matched) continue
    const snapshotID = readPositiveInt(matched.id)
    if (snapshotID === undefined) continue
    out[clientID] = snapshotID
    usedRefIDs.add(snapshotID)
  }
  return out
}

function parseJSONTextAsRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function normalizeCreativeReferenceSnapshot(response: Record<string, unknown>): Record<string, unknown>[] {
  const snapshot = response.canonical_snapshot
  if (!isRecord(snapshot)) return []
  const creativeReferences = snapshot.creative_references
  return Array.isArray(creativeReferences) ? creativeReferences.filter((value): value is Record<string, unknown> => isRecord(value)) : []
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readClientID(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== trimmed) return undefined
    return parsed
  }
  return undefined
}

function resolveWorkspaceProjectId(target: Record<string, unknown>): number | undefined {
  const fromProject = readPositiveInt(target.projectId)
  if (fromProject !== undefined) return fromProject
  if (readText(target.entityType) !== 'project') return undefined
  return readPositiveInt(target.entityId)
}
