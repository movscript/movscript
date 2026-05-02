import type { JSONValue } from '../types.js'
import { executeDeterministicProductionAction } from './deterministicExecutor.js'
import { InMemoryProductionStore, type ProductionStore } from './store.js'
import { DisabledProductionV2FallbackClient, type ProductionV2FallbackClient } from './v2FallbackClient.js'
import type {
  CreateProductionActionInput,
  ProductionAction,
  ProductionActionType,
  ProductionCandidate,
  ProductionCandidateLifecycleEvent,
  ProductionObjectRef,
  ProductionRun,
  ProductionApplyPreview,
  ProductionCandidateLifecycleInput,
  ReviseProductionCandidateInput,
  SupersedeProductionCandidateInput,
} from './types.js'

export class ProductionRuntime {
  private readonly store: ProductionStore
  private readonly v2FallbackClient: ProductionV2FallbackClient

  constructor(options: { store?: ProductionStore; v2FallbackClient?: ProductionV2FallbackClient } = {}) {
    this.store = options.store ?? new InMemoryProductionStore()
    this.v2FallbackClient = options.v2FallbackClient ?? new DisabledProductionV2FallbackClient()
  }

  async createAction(input: CreateProductionActionInput): Promise<ProductionRun> {
    const action = normalizeProductionAction(input)
    const run = executeDeterministicProductionAction(action)
    await this.applyV2Fallback(action, run)
    this.store.createRun(run)
    for (const candidate of run.candidates) this.store.createCandidate(candidate)
    return run
  }

  listRuns(): ProductionRun[] {
    return this.store.listRuns()
  }

  getRun(id: string): ProductionRun | undefined {
    return this.store.getRun(id)
  }

  listCandidates(): ProductionCandidate[] {
    return this.store.listCandidates()
  }

  getCandidate(id: string): ProductionCandidate | undefined {
    return this.store.getCandidate(id)
  }

  previewCandidateApply(candidateId: string): ProductionApplyPreview {
    const candidate = this.requireCandidate(candidateId)
    const v2DataOperation = resolveV2DataOperation(candidate)
    const requiredContext = resolveRequiredApplyContext(candidate)
    const warnings = [
      'Apply preview only; no V2 data action was called.',
      ...(v2DataOperation ? [] : [`No V2 data operation target is registered for candidate type ${candidate.type}.`]),
    ]

    if (candidate.status !== 'accepted') {
      const requiredAction = candidate.status === 'candidate' ? 'accept_candidate' : 'none'
      return {
        candidateId: candidate.id,
        projectId: candidate.projectId,
        candidateStatus: candidate.status,
        status: 'not_applicable',
        canApply: false,
        approval: {
          candidateId: candidate.id,
          approvalPolicy: 'explicit_accept_required',
          requiredAction,
          status: 'not_applicable',
          reason: candidate.status === 'candidate'
            ? 'Candidate must be accepted before apply preview can reach the V2 apply gate.'
            : `Candidate status ${candidate.status} cannot be applied.`,
        },
        ...(v2DataOperation ? { v2DataOperation } : {}),
        ...(candidate.targetObject ? { targetObject: candidate.targetObject } : {}),
        requiredContext,
        warnings,
      }
    }

    return {
      candidateId: candidate.id,
      projectId: candidate.projectId,
      candidateStatus: candidate.status,
      status: 'blocked',
      canApply: false,
      approval: {
        candidateId: candidate.id,
        approvalPolicy: 'explicit_accept_required',
        requiredAction: 'call_v2_data_action',
        status: 'blocked',
        reason: 'Candidate is accepted in runtime-local state, but applying to V2 canonical objects requires a dedicated V2 data action.',
      },
      ...(v2DataOperation ? { v2DataOperation } : {}),
      ...(candidate.targetObject ? { targetObject: candidate.targetObject } : {}),
      requiredContext,
      warnings,
    }
  }

  rejectCandidate(input: ProductionCandidateLifecycleInput): ProductionCandidate {
    const candidate = this.requireCandidate(input.candidateId)
    if (candidate.status !== 'candidate') {
      throw new Error(`candidate ${candidate.id} cannot be rejected from status ${candidate.status}`)
    }
    const now = isoNow()
    const updated = withLifecycle(candidate, {
      type: 'rejected',
      at: now,
      ...normalizeLifecycleMetadata(input),
    })
    this.store.updateCandidate({
      ...updated,
      status: 'rejected',
      updatedAt: now,
      statusChangedAt: now,
      statusReason: normalizeOptionalString(input.reason),
    })
    return this.requireCandidate(candidate.id)
  }

  acceptCandidate(input: ProductionCandidateLifecycleInput): ProductionCandidate {
    const candidate = this.requireCandidate(input.candidateId)
    if (candidate.status !== 'candidate') {
      throw new Error(`candidate ${candidate.id} cannot be accepted from status ${candidate.status}`)
    }
    const now = isoNow()
    const updated = withLifecycle(candidate, {
      type: 'accepted',
      at: now,
      ...normalizeLifecycleMetadata(input),
    })
    this.store.updateCandidate({
      ...updated,
      status: 'accepted',
      updatedAt: now,
      statusChangedAt: now,
      statusReason: normalizeOptionalString(input.reason) ?? 'explicit_accept_required; runtime status only, no V2 apply performed',
    })
    return this.requireCandidate(candidate.id)
  }

  reviseCandidate(input: ReviseProductionCandidateInput): { original: ProductionCandidate; revision: ProductionCandidate } {
    const candidate = this.requireCandidate(input.candidateId)
    if (candidate.status !== 'candidate') {
      throw new Error(`candidate ${candidate.id} cannot be revised from status ${candidate.status}`)
    }

    const now = isoNow()
    const revision: ProductionCandidate = {
      ...candidate,
      id: makeId('production_candidate'),
      status: 'candidate',
      payload: normalizeCandidatePayload(input.payload, candidate.payload),
      ...(normalizeOptionalNumber(input.confidence) !== undefined ? { confidence: normalizeOptionalNumber(input.confidence) } : {}),
      ...(normalizeEvidence(input.evidence, candidate.evidence) ? { evidence: normalizeEvidence(input.evidence, candidate.evidence) } : {}),
      createdAt: now,
      updatedAt: now,
      statusChangedAt: now,
      statusReason: normalizeOptionalString(input.reason),
      revisedFromCandidateId: candidate.id,
      supersedesCandidateId: candidate.id,
      lifecycle: [
        {
          type: 'created',
          at: now,
          reason: 'revision candidate',
          sourceCandidateId: candidate.id,
        },
        {
          type: 'revised',
          at: now,
          ...normalizeLifecycleMetadata(input),
          sourceCandidateId: candidate.id,
        },
      ],
    }

    const original = withLifecycle(candidate, {
      type: 'revised',
      at: now,
      ...normalizeLifecycleMetadata(input),
      targetCandidateId: revision.id,
    })
    const updatedOriginal: ProductionCandidate = {
      ...original,
      status: 'revised',
      updatedAt: now,
      statusChangedAt: now,
      statusReason: normalizeOptionalString(input.reason),
      revisedByCandidateId: revision.id,
      supersededByCandidateId: revision.id,
    }

    this.updateRunCandidates(candidate.sourceRunId, [updatedOriginal, revision])
    return {
      original: this.requireCandidate(candidate.id),
      revision: this.requireCandidate(revision.id),
    }
  }

  supersedeCandidate(input: SupersedeProductionCandidateInput): ProductionCandidate {
    const candidate = this.requireCandidate(input.candidateId)
    if (candidate.status !== 'candidate') {
      throw new Error(`candidate ${candidate.id} cannot be superseded from status ${candidate.status}`)
    }
    const supersededByCandidateId = normalizeOptionalString(input.supersededByCandidateId)
    if (supersededByCandidateId && !this.store.getCandidate(supersededByCandidateId)) {
      throw new Error(`supersededByCandidateId ${supersededByCandidateId} does not exist`)
    }
    const now = isoNow()
    const updated = withLifecycle(candidate, {
      type: 'superseded',
      at: now,
      ...normalizeLifecycleMetadata(input),
      targetCandidateId: supersededByCandidateId,
    })
    this.store.updateCandidate({
      ...updated,
      status: 'superseded',
      updatedAt: now,
      statusChangedAt: now,
      statusReason: normalizeOptionalString(input.reason),
      ...(supersededByCandidateId ? { supersededByCandidateId } : {}),
    })
    return this.requireCandidate(candidate.id)
  }

  isV2FallbackEnabled(): boolean {
    return this.v2FallbackClient.isEnabled()
  }

  private async applyV2Fallback(action: ProductionAction, run: ProductionRun): Promise<void> {
    if (run.status === 'failed') return
    try {
      const result = action.type === 'AnalyzeScriptToSections'
        ? await this.v2FallbackClient.writeAnalyzeScriptToSections(action, run)
        : action.type === 'GenerateKeyframeCandidates'
          ? await this.v2FallbackClient.writeGenerateKeyframeCandidates(action, run)
          : undefined
      if (!result) return
      if (result.performed) {
        run.warnings.push(action.type === 'AnalyzeScriptToSections'
          ? 'V2 fallback wrote AnalyzeScriptToSections output through script-preview/analyze.'
          : 'V2 fallback wrote GenerateKeyframeCandidates output through script-preview/generate-preview.')
      } else if (result.skippedReason) {
        run.warnings.push(result.skippedReason)
      }
    } catch (error) {
      run.warnings.push(error instanceof Error ? error.message : String(error))
    }
  }

  private requireCandidate(id: string): ProductionCandidate {
    const candidate = this.store.getCandidate(id)
    if (!candidate) throw new Error(`production candidate ${id} not found`)
    return candidate
  }

  private updateRunCandidates(runId: string, candidates: ProductionCandidate[]): void {
    const run = this.store.getRun(runId)
    if (!run) throw new Error(`production run ${runId} not found`)
    const replacements = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const existingIds = new Set(run.candidates.map((candidate) => candidate.id))
    const nextRun: ProductionRun = {
      ...run,
      candidates: [
        ...run.candidates.map((candidate) => replacements.get(candidate.id) ?? candidate),
        ...candidates.filter((candidate) => !existingIds.has(candidate.id)),
      ],
    }
    this.store.updateRun(nextRun)
  }
}

export function normalizeProductionAction(input: CreateProductionActionInput): ProductionAction {
  const actionType = normalizeActionType(input.actionType)
  const projectId = normalizeProjectId(input.projectId)
  return {
    id: typeof input.actionId === 'string' && input.actionId.trim() ? input.actionId.trim() : makeId('production_action'),
    type: actionType,
    projectId,
    ...(isRecord(input.sourceObject) ? { sourceObject: normalizeSourceObject(input.sourceObject) } : {}),
    inputContext: isRecord(input.inputContext) ? normalizeRecord(input.inputContext) : {},
    ...(typeof input.requestedBy === 'string' && input.requestedBy.trim() ? { requestedBy: input.requestedBy.trim() } : {}),
    approvalPolicy: 'candidate_write',
    createdAt: isoNow(),
  }
}

function normalizeActionType(value: unknown): ProductionActionType {
  if (
    value === 'AnalyzeScriptToSections' ||
    value === 'ExtractSituations' ||
    value === 'GenerateStoryboardScript' ||
    value === 'GenerateKeyframeCandidates' ||
    value === 'PrepareAssetSlots' ||
    value === 'BuildPreviewTimelineProposal'
  ) {
    return value
  }
  throw new Error('actionType must be a supported ProductionAction type')
}

function normalizeProjectId(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('projectId must be a positive number')
  return parsed
}

function normalizeSourceObject(value: Record<string, unknown>): ProductionObjectRef {
  if (typeof value.objectType !== 'string' || !value.objectType.trim()) {
    throw new Error('sourceObject.objectType is required when sourceObject is provided')
  }
  return {
    objectType: value.objectType.trim(),
    ...(isRefId(value.objectId) ? { objectId: value.objectId } : {}),
    ...(isRefId(value.versionId) ? { versionId: value.versionId } : {}),
  }
}

function normalizeRecord(value: Record<string, unknown>): Record<string, JSONValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, JSONValue>
}

function normalizeCandidatePayload(value: unknown, fallback: Record<string, JSONValue>): Record<string, JSONValue> {
  return isRecord(value) ? normalizeRecord(value) : JSON.parse(JSON.stringify(fallback)) as Record<string, JSONValue>
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeEvidence(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (Array.isArray(value)) {
    const evidence = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    return evidence.length > 0 ? evidence : undefined
  }
  return fallback ? [...fallback] : undefined
}

function normalizeLifecycleMetadata(input: ProductionCandidateLifecycleInput): Pick<ProductionCandidateLifecycleEvent, 'actor' | 'reason'> {
  return {
    ...(normalizeOptionalString(input.actor) ? { actor: normalizeOptionalString(input.actor) } : {}),
    ...(normalizeOptionalString(input.reason) ? { reason: normalizeOptionalString(input.reason) } : {}),
  }
}

function withLifecycle(candidate: ProductionCandidate, event: ProductionCandidateLifecycleEvent): ProductionCandidate {
  return {
    ...candidate,
    lifecycle: [
      ...(candidate.lifecycle ?? [{ type: 'created', at: candidate.createdAt }]),
      event,
    ],
  }
}

function resolveV2DataOperation(candidate: ProductionCandidate): string | undefined {
  switch (candidate.type) {
    case 'script_section':
      return 'UpsertScriptSectionCandidates'
    case 'situation':
      return 'UpsertSituationCandidates'
    case 'storyboard_script':
      return 'UpsertStoryboardSuggestions'
    case 'keyframe':
      return 'UpsertKeyframeCandidates'
    case 'asset_slot':
      return 'UpsertAssetSlotCandidates'
    case 'preview_timeline':
      return 'BuildPreviewTimeline / SavePreviewProposal'
    default:
      return undefined
  }
}

function resolveRequiredApplyContext(candidate: ProductionCandidate): string[] {
  const required = ['projectId', 'candidateId', 'sourceRunId', 'sourceActionId']
  if (!candidate.targetObject) required.push('targetObject')
  if (candidate.type === 'script_section' && !candidate.targetObject?.versionId) required.push('scriptVersionId')
  if (candidate.type === 'keyframe' && !candidate.targetObject?.objectId) required.push('contentUnitId or storyboardRowClientId')
  return required
}

function isRefId(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim().length > 0) || (typeof value === 'number' && Number.isFinite(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isoNow(): string {
  return new Date().toISOString()
}
