import {
  workspaceCandidateSemanticRecord,
} from '@movscript/core/workspace'
import {
  createElectronMovScriptWorkspaceService,
} from '@/shared/infrastructure/workspaceDomainRepository'
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'

type WorkspaceCandidatePayload = object

export async function createWorkspaceAssetSlotCandidate(
  projectId: number,
  payload: WorkspaceCandidatePayload,
  targetRecord?: SemanticEntityRecord,
): Promise<SemanticEntityRecord> {
  const result = await createElectronMovScriptWorkspaceService({ projectId }).createAssetSlotCandidate({
    projectId,
    payload: payload as Record<string, unknown>,
    targetRecord: targetRecord as Record<string, unknown> | undefined,
  })
  return workspaceCandidateSemanticRecord(result) as SemanticEntityRecord
}

export async function createWorkspaceKeyframeCandidate(
  projectId: number,
  payload: WorkspaceCandidatePayload,
): Promise<SemanticEntityRecord> {
  const result = await createElectronMovScriptWorkspaceService({ projectId }).createKeyframeCandidate({
    projectId,
    payload: payload as Record<string, unknown>,
  })
  return workspaceCandidateSemanticRecord(result) as SemanticEntityRecord
}
