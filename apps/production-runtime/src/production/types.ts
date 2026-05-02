import type { JSONValue } from '../types.js'

export type ProductionActionType =
  | 'AnalyzeScriptToSegments'
  | 'ExtractSceneMoments'
  | 'GenerateStoryboardScript'
  | 'GenerateKeyframeCandidates'
  | 'PrepareAssetSlots'
  | 'BuildPreviewTimelineProposal'

export type ProductionRunStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled'
export type ProductionStepType = 'read_context' | 'analyze' | 'generate' | 'validate' | 'write_candidate' | 'request_approval'
export type ProductionStepStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'
export type ProductionCandidateStatus = 'candidate' | 'accepted' | 'rejected' | 'revised' | 'superseded'
export type ProductionApprovalPolicy =
  | 'no_approval'
  | 'candidate_write'
  | 'explicit_accept_required'
  | 'cost_or_external_effect_required'
export type ProductionApprovalStatus = 'pending' | 'approved' | 'blocked' | 'not_applicable'
export type ProductionApplyPreviewStatus = 'blocked' | 'not_applicable'
export type ProductionApprovalRequiredAction =
  | 'accept_candidate'
  | 'call_v2_data_action'
  | 'none'

export type ProductionCandidateLifecycleEventType =
  | 'created'
  | 'accepted'
  | 'rejected'
  | 'revised'
  | 'superseded'

export interface ProductionCandidateLifecycleEvent {
  type: ProductionCandidateLifecycleEventType
  at: string
  reason?: string
  actor?: string
  sourceCandidateId?: string
  targetCandidateId?: string
}

export interface ProductionObjectRef {
  objectType: string
  objectId?: string | number
  versionId?: string | number
}

export interface ProductionAction {
  id: string
  type: ProductionActionType
  projectId: number
  sourceObject?: ProductionObjectRef
  inputContext: Record<string, JSONValue>
  requestedBy?: string
  approvalPolicy: ProductionApprovalPolicy
  createdAt: string
}

export interface ProductionRunStep {
  id: string
  runId: string
  type: ProductionStepType
  status: ProductionStepStatus
  inputSummary?: string
  outputSummary?: string
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface ProductionCandidate {
  id: string
  type: string
  projectId: number
  sourceActionId: string
  sourceRunId: string
  targetObject?: ProductionObjectRef
  status: ProductionCandidateStatus
  payload: Record<string, JSONValue>
  confidence?: number
  evidence?: string[]
  createdAt: string
  updatedAt?: string
  statusChangedAt?: string
  statusReason?: string
  revisedFromCandidateId?: string
  revisedByCandidateId?: string
  supersedesCandidateId?: string
  supersededByCandidateId?: string
  lifecycle?: ProductionCandidateLifecycleEvent[]
}

export interface ProductionApproval {
  candidateId: string
  approvalPolicy: ProductionApprovalPolicy
  requiredAction: ProductionApprovalRequiredAction
  status: ProductionApprovalStatus
  reason: string
}

export interface ProductionApplyPreview {
  candidateId: string
  projectId: number
  candidateStatus: ProductionCandidateStatus
  status: ProductionApplyPreviewStatus
  canApply: false
  approval: ProductionApproval
  v2DataOperation?: string
  targetObject?: ProductionObjectRef
  requiredContext: string[]
  warnings: string[]
}

export interface ProductionRun {
  id: string
  actionId: string
  actionType: ProductionActionType
  status: ProductionRunStatus
  projectId: number
  steps: ProductionRunStep[]
  candidates: ProductionCandidate[]
  warnings: string[]
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface CreateProductionActionInput {
  actionId?: unknown
  actionType?: unknown
  projectId?: unknown
  sourceObject?: unknown
  inputContext?: unknown
  requestedBy?: unknown
}

export interface ProductionCandidateLifecycleInput {
  candidateId: string
  reason?: unknown
  actor?: unknown
}

export interface ReviseProductionCandidateInput extends ProductionCandidateLifecycleInput {
  payload?: unknown
  confidence?: unknown
  evidence?: unknown
}

export interface SupersedeProductionCandidateInput extends ProductionCandidateLifecycleInput {
  supersededByCandidateId?: unknown
}
